const http = require("http");
export default class Util {
  
  static sum(list) {
    let s = 0
    list.forEach(n => {
      s += n
    });
    return s
  }
  static id = 1;
  static getUniqId() {
    this.id++;
    return this.id;
  }
  static getRandom(from, to) {
    return from + Math.floor(Math.random() * (to - from));
  }
  static removeFromArr(arr, item) {
    let idx = arr.indexOf(item);
    if (idx > -1) {
      arr.splice(idx, 1);
    }
  }
  static doAjax(url) {
    return new Promise((rsv, rej) => {
      http.get(url, data => {
        var str = "";
        data.on("data", function (chunk) {
          str += chunk; //监听数据响应，拼接数据片段
        });
        data.on("end", function () {
          try {
            data = JSON.parse(str);
          } catch (err) { }
          rsv(data);
        });
      });
    });
  }
  static delay(time) {
    return new Promise(rsv => {
      setTimeout(() => {
        rsv(null)
      }, time);
    })
  }
  static shuffle(arr) {
    return arr.sort(() => Math.random() - 0.5);
  }
  static getRandomInt(min: number = 0, max: number = 1): number {
    return Math.floor(Math.random() * (max - min) + min);
  }
}
