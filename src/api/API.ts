import axios from "axios";
import { KEKE_HOST } from "../socket/config";

var request = require("request");
export default class API {
  static doAjax({ url, method, data }) {
    return new Promise((rsv, rej) => {
      axios(
        {
          url: url,
          method: method,
          headers: {
            "content-type": "application/json"
          },
          data: data,
          params: data
        }
      ).then(e => {
        rsv(e.data);
      }).catch(e => {
        rej('接口错误')
      })
    });
  }
  static mapToken = {};
  static mapSSToken = {}
  static async changeCoin(uid, diamond, cost_diamond, roundId, game_room_id, game_round_id) {
    return new Promise(async (rsv, rej) => {
      let dataSend = {
        token: this.mapToken[uid],
        ss_token: this.mapSSToken[uid],
        diamond_type: diamond < 0 ? 1 : 2,
        diamond: Math.abs(diamond),
        game_data: {
          roundId,
          game_id: 2,
          cost_diamond,
          game_room_id,
          game_round_id
        }
      }
      let serverRes: any = await this.doAjax({
        url: KEKE_HOST + "/texas/diamond",
        method: "post",
        data: dataSend
      });
      let res = serverRes
      console.log(res, 'dddd')
      // 转化数据格式
      if (res.code == 0) {
        let data = res.data;
        console.log(data, '金币修改结果正常')
        rsv(null)
      } else {
        console.log(res.msg, '金币修改通知异常')
        rej(res.msg)
      }

    })
  }
  static async getUserInfo(token) {
    console.log('开始请求壳壳')
    try {
      let serverRes: any = await this.doAjax({
        url: KEKE_HOST + "/mouse/init",
        method: "get",
        data: {
          token: token
        }
      });
      let res = serverRes
      // 转化数据格式
      if (res.code == 0) {
        let data = res.data;
        console.log(data, '获取')
        this.mapToken[data.user_data.user_id] = token;
        this.mapSSToken[data.user_data.user_id] = data.ss_token;
        return {
          avatar: data.user_data.image,
          sex: 0,
          nickname: data.user_data.nickname,
          uid: data.user_data.user_id,
          gainTotal: 0,
          coin: data.finance_data.diamond_balance
        }
      } else {
        return Promise.reject(res.msg)
      }
    } catch (e) {
      console.log('getUserInfo catch', e)
      return Promise.reject('壳壳接口错误')
    }
  }
}
