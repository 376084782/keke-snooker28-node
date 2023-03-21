import Util from "../Util";
import socketManager from "..";
import _ from "lodash";
import PROTOCLE from "../config/PROTOCLE";
import ModelConfigRoom from "../../models/ModelConfigRoom";
// import TrackingManager from "./TrackingManager";
import ModelUser from "../../models/ModelUser";
import API from "../../api/API";
import uuid = require('node-uuid')
// 游戏内玩家全部离线的房间，自动清除
export default class RoomManager {
  // 房间等级
  level = 1;
  roomId = 0;
  roomIdUniq = '';
  isPublic = true;
  // 0匹配阶段 1开始游戏 2倒计时开始  10结算
  step = 0;
  waitToStart = 30000;
  game: any = {
    count: 0,
    countInRound: 0,
    ballLeft: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    deskList: [],
    currentSeat: 0,
    chip: 20000,
    timeEnd: 0,
    round: 1
  };
  roundAllIn = {};
  maxRound = 15;

  // 存当前在游戏中的uid列表
  get uidList() {
    return this.userList.map(e => e.uid);
  }
  get uidListInGame() {
    return this.userListInGame.map(e => e.uid);
  }
  get userListInGame() {
    return this.userList.filter(e => e.inGame);
  }
  uidListLastRound = [];
  userList = [];

  constructor({ level }) {
    this.roomId = Util.getUniqId();
    this.roomIdUniq = uuid.v4()
    this.level = level;

    this.step = 0;
    this.resetGameInfo();
  }

  showChat(uid, conf) {
    socketManager.sendMsgByUidList(this.uidList, 'CHAT', { uid, conf });

  }
  async initConfig() {
    let config = await ModelConfigRoom.findOne({ id: this.level });
    this.config = {
      name: config.name,
      id: config.id,
      basicChip: config.basicChip,
      chipList: config.chipList,
      teaMoney: config.teaMoney,
      min: config.min,
      max: config.max,
      percentage: config.percentage
    };
  }
  doConnect(uid) {
    let user = this.userList.find(e => e.uid == uid);
    if (user && user.isDisConnected) {
      user.isDisConnected = false;
      socketManager.sendMsgByUidList(
        this.uidList,
        PROTOCLE.SERVER.ROOM_USER_UPDATE,
        {
          userList: this.userList
        }
      );
    }
  }
  userDisconnectInGame(uid) {
    let user = this.userList.find(e => e.uid == uid);
    if (user) {
      user.isDisConnected = true;
      socketManager.sendMsgByUidList(
        this.uidList,
        PROTOCLE.SERVER.ROOM_USER_UPDATE,
        {
          userList: this.userList
        }
      );
    }

  }
  // 玩家离开
  leave(uid, withMsg = true) {
    if (this.step > 0 && this.step != 2) {
      if (this.userListInGame.findIndex(e => e.uid == uid) > -1) {
        this.userDisconnectInGame(uid)
        return -1;
      }
    }
    clearTimeout(this.timerJoin[uid]);
    if (withMsg) {
      socketManager.sendMsgByUidList([uid], PROTOCLE.SERVER.GO_HALL, {});
    }
    this.userList = this.userList.filter(user => user.uid != uid);
    socketManager.sendMsgByUidList(
      this.uidList,
      PROTOCLE.SERVER.ROOM_USER_UPDATE,
      {
        userList: this.userList
      }
    );
  }
  // 玩家准备
  async doReady(uid) {
    if (this.step == 1 || this.step == 10) {
      return
    }
    let userInfo = this.getUserById(uid);
    userInfo.isReady = true;
    socketManager.sendMsgByUidList(
      this.uidList,
      PROTOCLE.SERVER.ROOM_USER_UPDATE,
      {
        userList: this.userList
      }
    );
    let listReady = this.userList.filter(e => e.isReady)
    if (listReady.length >= 2 && (listReady.length >= this.userList.length)) {
      // 在房间内的所有人都准备而且满足最小起开人数，开始游戏
      this.doStartGame();
    }
  }
  timerJoin = {};
  // 玩家加入
  async join(userInfo) {
    try {
      // v2: 每次进⼊房间 更新服务端初始化拉取最新钻⽯剩余
      let userInfoNew = await socketManager.getUserInfoByUid(userInfo.uid)
      // if (userInfoNew.coin < 3000) {
      //   API.changeCoin(userInfoNew.uid, 3000, 3000, 1, 2, 2)
      // }
      userInfo.coin = userInfoNew.coin;
      await this.initConfig();
      if (userInfo.coin > this.config.max) {
        console.log(`${userInfo.uid}鉆石大于该房间上限，无法加入`)
        socketManager.sendErrByUidList([userInfo.uid], "match", {
          msg: "鉆石大於該房間上限"
        });
        return;
      }
      if (userInfo.coin < this.config.min) {
        console.log(`${userInfo.uid}鉆石不足，无法加入`)
        socketManager.sendErrByUidList([userInfo.uid], "match", {
          msg: "鉆石不足"
        });
        return;
      }
      if (this.uidList.indexOf(userInfo.uid) > -1) {
        console.log(`${userInfo.uid}已经在房间里，无法重复加入`)
        socketManager.sendErrByUidList([userInfo.uid], "match", {
          msg: "玩家已經在房間內"
        });
        return;
      } else {
        let blankSeat = this.getBlankSeat();
        if (blankSeat == 0) {
          console.log(`房间已满员，${userInfo.uid}无法加入`)
          socketManager.sendErrByUidList([userInfo.uid], "match", {
            msg: "房間已滿"
          });
          return;
        }
        userInfo.seat = blankSeat;
        this.userList.push(userInfo);
      }
      this.userList = this.userList.sort((a: any, b: any) => a.seat - b.seat)
      this.checkCanStart();

      socketManager.sendMsgByUidList(
        this.uidList,
        PROTOCLE.SERVER.ROOM_USER_UPDATE,
        {
          userList: this.userList
        }
      );
      socketManager.sendMsgByUidList([userInfo.uid], PROTOCLE.SERVER.GO_GAME, {
        dataGame: this.getRoomInfo()
      });
    } catch (e) {
      console.log('join方法错误', e)
    }
  }
  getBlankSeat() {
    for (let i = 1; i < 4; i++) {
      if (!this.userList.find(e => e.seat == i)) {
        return i;
      }
    }
    return 0;
  }

  checkInRoom(uid) {
    return this.uidList.indexOf(uid) > -1;
  }

  getUserById(uid) {
    return this.userList.find(e => e.uid == uid);
  }
  addTimerToLeave(uid) {
    // return
    this.timerJoin[uid] = setTimeout(() => {
      // 十秒内不准备，踢出房间
      console.log(`${uid}10s不准备，被t出房间`)
      this.leave(uid);
    }, 10000);
  }
  checkCanStart() {
    // 如果都准备了 开始游戏
    let t = new Date().getTime();
    let timeWaiting = this.waitToStart;
    if (!this.game.timeStart) {
      this.step = 2;
      this.game.timeStart = t + timeWaiting;
      socketManager.sendMsgByUidList(this.uidList, "BEFORE_START", {
        timeStart: this.game.timeStart
      });
      setTimeout(() => {
        if (this.uidList.length > 1) {
        } else {
          // 全部t出，关闭房间
          // console.log('准备倒计时结束，玩家人数不足，全部t出房间')
          // this.game.timeStart = 0
          // this.uidList.forEach(uid => {
          //   this.leave(uid)
          // })
        }
      }, this.waitToStart);
    }
  }
  resetGameInfo() {
    clearTimeout(this.timerNext);
    this.game.timeStart = 0
    this.flagCanDoAction = false;
    this.step = 0;
    this.countBYQ = 0;
    this.flagFinishAfterAllinAndBYQ = false;
    this.roundAllIn = {};
    this.game = {
      count: 0,
      countInRound: this.userList.length,
      ballLeft: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      deskList: [],
      currentSeat: 0,
      chip: 0,
      timeEnd: 0,
      round: 1
    };
    this.userList.forEach(user => {
      user.ballList = [];
      user.isReady = false;
      user.isLose = false;
      user.deskList = [];
      user.inGame = false;
      if (user.isDisConnected) {
        this.leave(user.uid)
      }
    });
  }
  config: any;
  gameId = 0;
  async doStartGame() {
    await this.initConfig();
    this.gameId = uuid.v4();
    this.game.countInRound = this.userList.length;
    this.uidListShowBall = [];
    this.winner = {};
    // 重置游戏数据
    this.step = 1;
    // 分发私有球
    this.userList.forEach(userInfo => {
      if (!userInfo.ballList) {
        userInfo.ballList = [];
      }
      userInfo.ballList.push(Util.getRandomInt(1, 10));
      userInfo.inGame = true
    });
    this.game.chip = this.config.basicChip;

    console.log('开始游戏，当前游戏中玩家:', this.userListInGame)
    this.userListInGame.forEach(e => {
      console.log(`${e.uid}当前鉆石数量:`, e.coin)
    })
    // for (let i = 0; i < this.userListInGame.length; i++) {
    //   let user = this.userListInGame[i];
    //   this.changeMoney(user.uid, -this.config.teaMoney, 30002);
    //   console.log(`扣除${user.uid}茶水费${this.config.teaMoney}鉆石`)
    // }
    // 随机开始座位
    let idxFirstUser = Util.getRandomInt(0, this.userListInGame.length);
    let userFirst = this.userListInGame[idxFirstUser]
    this.game.firstSeat = userFirst.seat;
    socketManager.sendMsgByUidList(this.uidList, "START_GAME", {
      chip: this.config.basicChip,
      dataGame: this.getRoomInfo()
    });
    this.game.round = 2;
    setTimeout(() => {
      // 扣除底注
      for (let i = 0; i < this.userListInGame.length; i++) {
        let user = this.userListInGame[i];
        this.throwMoney(user.uid, this.config.basicChip, 5);
        console.log(`开始游戏，扣除${user.uid}底注${this.config.basicChip}鉆石`)
      }
      setTimeout(() => {
        this.flagCanDoAction = true;
        this.callNextTurn(userFirst.seat);
        socketManager.sendMsgByUidList(this.uidList, "ACTION", {
          dataGame: this.getRoomInfo()
        });
      }, 2000);
    }, 1000);
  }
  flagCanDoAction = true;
  async doAction(uid, type, data?) {
    if (data && data.chip) {
      data.chip = +data.chip
    }
    let user = this.getUserById(uid);
    let chipBefore = this.game.chip;

    if (user.seat != this.game.currentSeat || !this.flagCanDoAction) {
      return;
    }
    this.flagCanDoAction = false;
    user.lastAction = type;
    socketManager.sendMsgByUidList(this.uidList, "ACTION_SOUND", {
      uid,
      type,
      data,
      chipBefore,
    });
    await Util.delay(100);
    if (type == 1) {
      if (data.chip >= user.coin) {
        return;
      }
      // 加注
      this.game.chip = data.chip;
      await this.throwMoney(uid, data.chip, 3);
    } else if (type == 2) {
      let isAdd = data.chip > this.game.chip
      this.game.chip = data.chip;
      if (this.game.ballLeft.length <= 0) {
        console.log(`${uid}请求要球，但是当前游戏没有剩余球了，失败`)
        return;
      }
      // 要球
      let ballIdx = Util.getRandomInt(0, this.game.ballLeft.length);

      if (user.tagCheat) {
        let p = Math.random() < 0.7;
        if (p) {
          // 高概率使现在的球相加=25至28
          for (let i = 0; i < this.game.ballLeft.length; i++) {
            let nn = this.game.ballLeft[i];
            let ss = Util.sum(user.ballList) + nn;
            if (ss <= 28 && ss >= 25) {
              ballIdx = i;
            }
          }
        }
        console.log(`${uid}执行要球，且有高概率标签`)
      } else {
        console.log(`${uid}执行要球，且无高概率标签`)
      }
      let ball = this.game.ballLeft.splice(ballIdx, 1)[0];
      user.ballList.push(ball);
      let sum = Util.sum(user.ballList)
      if (sum == 28) {
        // 正好达到28点，计数
        // TrackingManager.addtracking28(user.uid)
      }
      socketManager.sendMsgByUidList(this.uidList, "GET_BALL", {
        ball,
        uid,
        listNew: user.ballList,
        ballLeft: this.game.ballLeft
      });
      await Util.delay(600);
      console.log(`${uid}扣除要球消耗的鉆石${data.chip}`)
      await this.throwMoney(uid, data.chip, isAdd ? 3 : 1);
      await Util.delay(200);
    } else if (type == 3) {
      let isAdd = data.chip > this.game.chip
      this.game.chip = data.chip;
      // 不要球
      console.log(`${uid}请求不要球`)
      await this.throwMoney(uid, data.chip, isAdd ? 4 : 2);
      console.log(`${uid}扣除不要球消耗的鉆石${data.chip}，并执行不要球操作`)
      this.countBYQ++
    } else if (type == 4) {
      // 放弃
      console.log(`${uid}请求放弃`)
      user.isLose = true;
      socketManager.sendMsgByUidList(this.uidList, "GIVEUP", { uid });
      console.log(`${uid}执行放弃操作`)
    }
    this.game.count++;
    if (this.game.count >= this.game.countInRound) {
      this.game.count = 0;
      let listAllinRound = [];
      for (let uid in this.roundAllIn) {
        listAllinRound.push(this.roundAllIn[uid])
      }
      if (this.game.round > Math.min(...listAllinRound)) {
        this.flagFinishAfterAllinAndBYQ = this.countBYQ == this.game.countInRound
      } else {
        this.flagFinishAfterAllinAndBYQ = false
      }

      this.countBYQ = 0;
      this.game.round++;
      this.game.countInRound = this.getUserCanPlay().length;
    }
    let turnFinish = this.game.count == 0;
    socketManager.sendMsgByUidList(this.uidList, "ACTION", {
      dataGame: this.getRoomInfo(),
      uid,
      type,
      data,
      chipBefore
    });
    if (type == 2) {
      await Util.delay(200);
    }
    this.callNextTurn(this.getNextSeat());
    let isFinish = await this.checkFinish(turnFinish);
    if (isFinish) {
      await Util.delay(8000);
      this.resetGameInfo();
      this.checkCanStart();
      this.userList.forEach(user => {
        if (user.coin < this.config.min) {
          // 鉆石不在房间范围内
          this.leave(user.uid)
          socketManager.sendMsgByUidList([user.uid], "FINISH_OVER", {
            dataGame: this.getRoomInfo(),
            isContinue: false,
            msg: '鉆石不足'
          });
        } else if (user.coin > this.config.max) {
          // 鉆石不在房间范围内
          this.leave(user.uid)
          socketManager.sendMsgByUidList([user.uid], "FINISH_OVER", {
            dataGame: this.getRoomInfo(),
            isContinue: false,
            msg: '鉆石大於房間上限'
          });
        } else {
          socketManager.sendMsgByUidList([user.uid], "FINISH_OVER", {
            dataGame: this.getRoomInfo(),
            isContinue: true,
            msg: ''
          });
        }
      })
    } else {
      await Util.delay(200);
      this.flagCanDoAction = true;
    }
  }
  uidsAutoGiveup = []
  callNextTurn(seat) {
    let timeCost = 30000;
    let timeEnd = new Date().getTime() + timeCost;
    clearTimeout(this.timerNext);
    this.game.currentSeat = seat;
    this.game.timeEnd = timeEnd;
    let user = this.userList.find(e => e.seat == this.game.currentSeat);
    this.timerNext = setTimeout(async () => {
      // 超时自动选择  第一轮自动要球 之后自动放弃
      if (user && user.isDisConnected) {
        console.log(`玩家${user.uid}操作超时时，正好掉线了，多等10s`)
        // 如果当时正好断线了，多等10s
        clearTimeout(this.timerNext);
        this.timerNext = setTimeout(() => {
          console.log(`玩家${user.uid}掉线后10s倒计时结束，自动放弃`)
          this.doAction(user.uid, 4, { chip: this.game.chip });
        }, 10 * 1000);
      } else {
        console.log(`玩家${user.uid}操作超时，自动放弃`)
        this.doAction(user.uid, 4, { chip: this.game.chip });
      }
    }, timeCost);
    if (user) {
      console.log(`轮转到${user.uid}执行操作`)
    }
    socketManager.sendMsgByUidList(this.uidList, "POWER", {
      timeEnd,
      currentSeat: this.game.currentSeat,
      chip: this.game.chip
    });
  }
  timestampNext = 0;
  timerNext = null;
  sort(list) {
    return list.sort((a, b) => {
      let sumA = this.getSumExpFirst(a.ballList);
      let sumB = this.getSumExpFirst(b.ballList);

      let funcCheck2 = () => {
        // B爆点或者认输了，继续比大小
        if (b.ballList.length > a.ballList.length) {
          // B球多 B大
          return 1;
        } else if (b.ballList.length == a.ballList.length) {
          // 一样多的球 公开球最大谁大就谁赢
          let maxB = Math.max(...b.ballList.slice(1, b.ballList.length));
          let maxA = Math.max(...a.ballList.slice(1, a.ballList.length));
          return maxB > maxA ? 1 : -1;
        } else {
          // B球少 B小
          return -1;
        }
      };
      let funcCheck1 = () => {
        // B没有公开球爆点或者认输
        if (totalB > totalA) {
          // 如果总和B大 B获胜
          return 1;
        } else if (totalB == totalA) {
          if (b.ballList.length > a.ballList.length) {
            return 1;
          } else if (b.ballList.length == a.ballList.length) {
            // 一样多的球 公开球最大谁大就谁赢
            let maxB = Math.max(...b.ballList.slice(1, b.ballList.length));
            let maxA = Math.max(...a.ballList.slice(1, a.ballList.length));
            return maxB > maxA ? 1 : -1;
          } else {
            return -1;
          }
        } else {
          return -1;
        }
      };
      let totalA = Util.sum(a.ballList);
      let totalB = Util.sum(b.ballList);
      if (sumA > 28 || a.isLose) {
        // A公开球爆点或者认输
        if (sumB < 28 && !b.isLose) {
          // B没有爆点或者认输,B大
          return 1;
        } else {
          return funcCheck2();
        }
      } else {
        // A没有公开求爆点或者认输
        if (sumB < 28 && !b.isLose) {
          if (totalA > 28) {
            // A总球数爆点
            if (totalB > 28) {
              // B总球数也爆点了
              return funcCheck2();
            } else {
              // B总球没有爆点 B大
              return 1;
            }
          } else {
            // A总球没有爆点
            if (totalB > 28) {
              // B总球爆点 A大
              return -1;
            } else {
              return funcCheck1();
            }
          }
        } else {
          return -1;
        }
      }
    });
  }
  getSumUntilRound(min, max) {
    let sum = 0;
    this.userListInGame.forEach(user => {
      sum += Util.sum(user.deskList.slice(min, max));
    });
    return sum;
  }
  winner: any = {};
  uidListShowBall = []
  showBalls(uid) {
    if (this.uidListShowBall.indexOf(uid) > -1) {
      return;
    }
    this.uidListShowBall.push(uid)
    console.log(`${uid}亮球`)
    socketManager.sendMsgByUidList(this.uidListLastRound, "SHOW_BALLS", {
      winner: this.winner,
      // dataGame: this.getRoomInfo(),
      uidListShowBall: this.uidListShowBall
    });
  }
  getDeskAll() {
    let sum = 0;
    this.userListInGame.forEach(e => {
      sum += Util.sum(e.deskList);
    });
    return sum;
  }
  getUserCanPlay() {
    return this.userListInGame.filter(
      e => !e.isLose && this.getSumExpFirst(e.ballList) < 28
    );
  }

  countBYQ = 0;
  flagFinishAfterAllinAndBYQ = false;


  async checkFinish(turnFinish) {
    let isFinish = false;
    // 15轮结束
    let roundFinish = this.game.round > 15;
    let isLose =
      this.userListInGame.filter(
        e => !e.isLose && this.getSumExpFirst(e.ballList) < 28
      ).length <= 1;
    // let onlyOneNotAllin =
    //   turnFinish &&
    //   this.userListInGame.filter(e => !this.roundAllIn[e.uid]).length <= 1;


    isFinish = roundFinish || isLose || this.flagFinishAfterAllinAndBYQ;
    if (!isFinish) {
      return false;
    }
    if (roundFinish) {
      console.log('15轮结束，结算')
    } else if (isLose) {
      console.log('只剩一个人没有认输，结算')
    } else if (this.flagFinishAfterAllinAndBYQ) {
      console.log('allin后全部不要球，结算')
    }
    this.step = 10;
    this.uidListLastRound = [].concat(this.uidList);
    // 排除掉认输或者公开球爆点的
    let listSort = this.sort(
      this.userListInGame.filter(e => {
        let sum = this.getSumExpFirst(e.ballList);
        return sum < 28 && !e.isLose;
      })
    );
    let winnerUser = listSort[0];
    let uu2 = listSort[1];
    let winner = {
      total: Util.sum(winnerUser.ballList),
      balls: winnerUser.ballList,
      uid: winnerUser.uid,
      mapGain: {}
    };
    this.winner = winner;
    console.log('最终球排序:', listSort);
    let roundAllIn1 = this.roundAllIn[winner.uid];
    let chipTotalInDesk = this.getDeskAll();
    console.log(chipTotalInDesk, 'chipTotalInDesk')
    if (roundAllIn1) {
      // 赢家allin 剩余两家大的拿剩下的钱
      let max1 = this.getSumUntilRound(0, roundAllIn1);
      let chipLeft = chipTotalInDesk - max1;
      // 先给赢家能拿的最大金额
      // 多出来的钱继续pk
      if (chipLeft > 0 && uu2) {
        // 如果有多的钱而且存在其他公开球不爆点且没认输的玩家
        winner.mapGain[winner.uid] = max1;
        winner.mapGain[uu2.uid] = chipLeft;
      } else {
        // 没有多的钱 或者 不存在其他公开球不爆点且没认输的玩家  直接给他钱
        winner.mapGain[winner.uid] = chipTotalInDesk;
      }
    } else {
      // 赢家没有allin过 直接给他钱
      winner.mapGain[winner.uid] = chipTotalInDesk;
    }
    if (roundFinish || this.flagFinishAfterAllinAndBYQ) {
      this.userListInGame.forEach(
        e => {
          let maxExpFirst = this.getSumExpFirst(e.ballList)
          if (!e.isLose && maxExpFirst < 28) {
            // 没有认输 没有爆点
            this.showBalls(e.uid)
          }
        });
      this.showBalls(winner.uid);
    }

    let p = 1;
    if (this.config.percentage) {
      p = (100 - this.config.percentage) / 100
    }
    for (let uu in winner.mapGain) {
      let cc = winner.mapGain[uu]
      winner.mapGain[uu] = Math.floor(cc * p)
      await this.changeMoney(uu, winner.mapGain[uu], 10000, cc);
    }
    console.log(chipTotalInDesk, winner.mapGain, 'winner.mapGain')
    socketManager.sendMsgByUidList(this.uidListLastRound, "FINISH", {
      winner
    });
    this.userListInGame.forEach(e => {
      console.log(`${e.uid}当前鉆石数量:`, e.coin)
    })
    return true;
  }
  async throwMoney(uid, num, tag) {
    let dataUser = this.userList.find(e => e.uid == uid);
    if (dataUser.coin == 0) {
      return;
    }
    let nn = num;
    if (dataUser.coin <= num) {
      nn = dataUser.coin;
      let flag = await this.changeMoney(uid, -dataUser.coin, tag);
      if (!flag) {
        nn = 0
      }
      if (!this.roundAllIn[uid]) {
        this.roundAllIn[uid] = this.game.round;
      }
    } else {
      let flag = await this.changeMoney(uid, -num, tag);
      if (!flag) {
        nn = 0
      }
    }
    let uu = this.getUserById(uid);
    if (!uu.deskList) {
      uu.deskList = [];
    }
    uu.deskList.push(nn);
    this.game.deskList.push(nn);
    socketManager.sendMsgByUidList(this.uidList, "THROW_MONEY", {
      uid,
      num
    });
  }
  async updateUserInfoByUid(uid) {
    try {
      let userInfo = await socketManager.getUserInfoByUid(uid);
      if (userInfo) {
        let userNow = this.userList.find(e => e.uid == uid);
        if (userNow) {
          userNow.coin = userInfo.coin
        }
      }
    } catch (e) {
      console.log('updateUserInfoByUid错误', e)
    }
  }
  changeMoney(uid, num, tag, cost_diamond?) {
    let game_room_id = this.roomIdUniq
    let game_round_id = this.gameId;
    return new Promise((rsv) => {
      API.changeCoin(uid, num, cost_diamond, this.game.round, game_room_id, game_round_id)
        .then(async e => {
          await this.updateUserInfoByUid(uid)
          // // 统计盈利情况
          // TrackingManager.addtrackingCost(uid, num)
          socketManager.sendMsgByUidList(
            this.uidList,
            PROTOCLE.SERVER.ROOM_USER_UPDATE,
            {
              userList: this.userList
            }
          );
          rsv(true)
        })
        .catch(e => {
          socketManager.sendErrByUidList(
            [uid],
            "changeMoney", {
            msg: e
          }
          );
          rsv(false)

        })

    })

  }
  getNextSeat() {
    let userCurrent = this.userListInGame.find(e => e.seat == this.game.currentSeat);
    let idx = this.userListInGame.indexOf(userCurrent);
    let idxNext = (idx + this.userListInGame.length + 1) % this.userListInGame.length;

    let user = this.userListInGame[idxNext];
    // 爆点或者放弃的，跳过
    if (user.isLose || !user.inGame || this.getSumExpFirst(user.ballList) >= 28) {
      idxNext = (idxNext + this.userListInGame.length + 1) % this.userListInGame.length;
    }
    return this.userListInGame[idxNext].seat;
  }
  getSumExpFirst(list: number[]) {
    let sum = 0;
    list.forEach((num, i) => {
      if (i != 0) {
        sum += num;
      }
    });
    return sum;
  }
  // 获取全服房间内游戏数据
  getRoomInfo() {
    let info: any = {
      isInRoom: true,
      gameInfo: {
        roomId: this.roomId,
        config: this.config,
        step: this.step,
        level: this.level,
        listUser: this.userList,
        gameInfo: this.game,
        winner: this.winner
      }
    };
    return info;
  }
}
