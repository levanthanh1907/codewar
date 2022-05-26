class AotGameState {
  constructor({ game, grid, botPlayer, enemyPlayer }) {
    this.game = game;
    this.grid = grid;
    this.botPlayer = botPlayer;
    this.enemyPlayer = enemyPlayer;
    this.distinctions = [];
  }

  isExtraturn() {
    return this.hasExtraTurn;
  }

  switchTurn() {
    const { enemyPlayer, botPlayer } = this;
    this.botPlayer = enemyPlayer;
    this.enemyPlayer = botPlayer;
  }

  getCurrentPlayer() {
    return this.botPlayer;
  }

  getCurrentEnemyPlayer() {
    return this.enemyPlayer;
  }

  addDistinction(result) {
    this.distinctions.push(result);
  }

  clone() {
    const game = this.game;
    const grid = this.grid.clone();
    const botPlayer = this.botPlayer.clone();
    const enemyPlayer = this.enemyPlayer.clone();
    return new AotGameState({ game, grid, botPlayer, enemyPlayer });
  }
}

class AotMove {
  type = "";
}

class AotCastSkill extends AotMove {
  type = "CAST_SKILL";
  isCastSkill = true;
  constructor(hero) {
    super();
    this.hero = hero;
  }
}

class AotSwapGem extends AotMove {
  type = "SWAP_GEM";
  isSwap = true;
  constructor(swap) {
    super();
    this.swap = swap;
  }
}

class ScaleFn {}

class LinearScale extends ScaleFn {
  constructor(a, b) {
    super();
    this.a = a;
    this.b = b;
  }

  exec(x) {
    return this.a * x + this.b;
  }
}

class AttackDamgeMetric extends ScaleFn {
  exec(gem, hero) {
    return (gem - 3) * hero.attack + hero.attack;
  }
}

class SumScale extends ScaleFn {
  exec(...args) {
    return args.reduce((a, c) => a + c, 0);
  }
}

class GameSimulator {
  constructor(state) {
    this.state = state;
  }

  getState() {
    return this.state;
  }

  applyMove(move) {
    if (move.isSwap) {
      this.applySwap(move);
    } else if (move.isCastSkill) {
      this.applyCastSkill(move);
    }
    return this;
  }

  applySwap(move) {
    const { swap } = move;
    const { index1, index2 } = swap;
    const result = this.state.grid.performSwap(index1, index2);
    this.applyDistinctionResult(result);
    return result;
  }

  applyDistinctionResult(result) {
    this.turnEffect = {
      attackGem: 0,
      manaGem: {},
    };

    for (const batch of result) {
      if (batch.isExtraTurn) {
        this.state.isExtraTurn = true;
      }

      for (const gem of batch.removedGems) {
        switch (gem.type) {
          case GemType.SWORD: {
            this.turnEffect.attackGem += 1;
          }
          default: {
            this.turnEffect.manaGem[gem.type] =
              (this.turnEffect.manaGem[gem.type] || 0) + 1;
          }
        }
      }
    }
    this.applyTurnEffect(this.turnEffect);
    this.state.addDistinction(result);
  }

  applyTurnEffect(turn) {
    this.applyAttack(turn.attackGem);
    for (const [type, value] of Object.entries(turn.manaGem)) {
      this.applyMana(type, value);
    }
  }

  applyAttack(attackGem) {
    const myHeroAlive = this.state.getCurrentPlayer().firstHeroAlive();
    const damgeMetric = new AttackDamgeMetric();
    const attackDame = 1 * damgeMetric.exec(attackGem, myHeroAlive);
    const enemyHeroAlive = this.state.getCurrentEnemyPlayer().firstHeroAlive();
    enemyHeroAlive.takeDamge(attackDame);
  }

  applyMana(type, value) {
    const firstAliveHeroCouldReceiveMana = this.state
      .getCurrentPlayer()
      .firstAliveHeroCouldReceiveMana(type);
    if (firstAliveHeroCouldReceiveMana) {
      const maxManaHeroCannCeceive =
        firstAliveHeroCouldReceiveMana.getMaxManaCouldTake();
      const manaToSend = Math.max(value, maxManaHeroCannCeceive);
      firstAliveHeroCouldReceiveMana.takeMana(manaToSend);

      const manaRemains = value - manaToSend;
      if (manaRemains > 0) {
        return this.applyMana(type, manaRemains);
      }
    }
    return value;
  }

  applyCastSkill(move) {}
}

class AotScoreMetric {
  score = 0;
  sumMetric = new SumScale();
  hpMetric = new LinearScale(1, 0);
  manaMetric = new LinearScale(1, 0);
  maxManaMetric = new LinearScale(0, 3);
  overManaMetric = new LinearScale(-1, 0);

  caclcHeroScore(hero) {
    const hpScore = this.hpMetric.exec(hero.hp);
    const manaScore = this.maxManaMetric.exec(hero.mana);
    const overManaScore = this.overManaMetric.exec(0);
    const heroScore = this.sumMetric.exec(hpScore, manaScore, overManaScore);
    return heroScore;
  }

  calcScoreOfPlayer(player) {
    const heros = player.getHerosAlive();
    const heroScores = heros.map((hero) => this.caclcHeroScore(hero));
    const totalHeroScore = this.sumMetric.exec(...heroScores);
    return totalHeroScore;
  }

  calc(state) {
    const myScore = this.calcScoreOfPlayer(state.getCurrentPlayer());
    const enemyScore = this.calcScoreOfPlayer(state.getCurrentEnemyPlayer());
    const score = myScore - enemyScore;
    return score;
  }
}

class AoTStrategy {
  static name = "aot";
  static factory() {
    return new AoTStrategy();
  }

  scoreMetrics = new AotScoreMetric();

  setGame({ game, grid, botPlayer, enemyPlayer }) {
    this.game = game;
    this.state = new AotGameState({ grid, botPlayer, enemyPlayer });
    this.snapshots = [];
  }

  playTurn() {
    console.log(`${AoTStrategy.name}: playTurn`);
    const state = this.getCurrentState();
    const action = this.chooseBestPosibleMove(state, 1);
    console.log(action);
    if (action.isCastSkill) {
      console.log(`${AoTStrategy.name}: isCastSkill`);
      this.castSkillHandle(action.hero);
    } else if (action.isSwap) {
      console.log(`${AoTStrategy.name}: isSwap`);
      this.swapGemHandle(action.swap);
    }
  }

  getCurrentState() {
    console.log(`${AoTStrategy.name}: getCurrentState`);
    return this.state.clone();
  }

  chooseBestPosibleMove(state, deep = 2) {
    console.log(`${AoTStrategy.name}: chooseBestPosibleMove`);
    const posibleMoves = this.getAllPosibleMove(state);
    console.log(`${AoTStrategy.name}: posibleMoves ${posibleMoves.length}`);

    let currentBestMove = posibleMoves[0];
    let currentBestMoveScore = -1;
    for (const move of posibleMoves) {
      console.log(
        `${AoTStrategy.name}: currentBestMove  ${posibleMoves.indexOf(move)}`
      );
      console.log(
        `${AoTStrategy.name}: currentBestMoveScore  ${currentBestMoveScore}`
      );

      const futureState = this.seeFutureState(move, state, deep);
      const simulateMoveScore = this.compareScoreOnStates(state, futureState);
      console.log(
        `${AoTStrategy.name}: simulateMoveScore  ${simulateMoveScore}`
      );

      if (simulateMoveScore > currentBestMove) {
        currentBestMove = move;
        currentBestMoveScore = simulateMoveScore;
      }
    }
    return currentBestMove;
  }

  seeFutureState(move, state, deep) {
    if (deep === 0) {
      return state;
    }

    const futureState = this.applyMoveOnState(move, state);
    if (futureState.isExtraturn()) {
      const newMove = this.chooseBestPosibleMove(futureState, deep);
      return this.seeFutureState(newMove, futureState, deep);
    }
    const newMove = this.chooseBestPosibleMove(futureState, deep - 1);
    return this.seeFutureState(newMove, futureState, deep - 1);
  }

  compareScoreOnStates(state1, state2) {
    console.log(`${AoTStrategy.name}: compareScoreOnState`);
    const score1 = this.caculateScoreOnState(state1);
    console.log(`${AoTStrategy.name}: compareScoreOnState score1 ${score1}`);

    const score2 = this.caculateScoreOnState(state2);
    console.log(`${AoTStrategy.name}: compareScoreOnState score2 ${score2}`);

    return score2 - score1;
  }

  caculateScoreOnState(state) {
    const score = this.scoreMetrics.calc(state);
    return score;
  }

  applyMoveOnState(move, state) {
    console.log(`${AoTStrategy.name}: applyMoveOnState`);
    const cloneState = state.clone();
    const simulator = new GameSimulator(cloneState);
    simulator.applyMove(move);
    const newState = simulator.getState();
    return newState;
  }

  getAllPosibleMove(state) {
    const posibleSkillCasts = this.getAllPosibleSkillCast(state);
    console.log(
      `${AoTStrategy.name}: posibleSkillCasts ${posibleSkillCasts.length}`
    );

    const posibleGemSwaps = this.getAllPosibleGemSwap(state);
    console.log(
      `${AoTStrategy.name}: posibleGemSwaps ${posibleGemSwaps.length}`
    );

    return [...posibleSkillCasts, ...posibleGemSwaps];
  }

  getAllPosibleSkillCast(state) {
    const currentPlayer = state.getCurrentPlayer();
    const castableHeros = currentPlayer.getCastableHeros();
    console.log(`${AoTStrategy.name}: castableHeros ${castableHeros.length}`);

    const posibleCastOnHeros = castableHeros.map((hero) =>
      this.posibleCastOnHero(hero, state)
    );
    console.log(
      `${AoTStrategy.name}: posibleCastOnHeros ${posibleCastOnHeros.length}`
    );

    const allPosibleCasts = [].concat(...posibleCastOnHeros);
    console.log(
      `${AoTStrategy.name}: allPosibleCasts ${allPosibleCasts.length}`
    );

    return allPosibleCasts;
  }

  posibleCastOnHero(hero, state) {
    // const casts = [new AotCastSkill(hero)];
    const casts = [];
    return casts;
  }

  getAllPosibleGemSwap(state) {
    const allPosibleSwaps = state.grid.suggestMatch();
    console.log(
      `${AoTStrategy.name}: allPosibleSwaps ${allPosibleSwaps.length}`
    );

    const allSwapMove = allPosibleSwaps.map((swap) => new AotSwapGem(swap));
    console.log(`${AoTStrategy.name}: allSwapMove ${allSwapMove.length}`);

    return allSwapMove;
  }

  addSwapGemHandle(callback) {
    this.swapGemHandle = callback;
  }

  addCastSkillHandle(callback) {
    this.castSkillHandle = callback;
  }
}

window.strategies = {
  ...(window.strategies || {}),
  [AoTStrategy.name]: AoTStrategy,
};
