import { Schema, model } from 'mongoose';

const ModelUser = new Schema({
  // 拥有的金币
  coin: { type: Number, default: 100000 },
  // 是否高概率获胜 25-28
  tagCheat: { type: Boolean, default: false },
  // uid
  uid: { type: String, default: '' },
  // 玩家名称
  nickname: { type: String, default: '' },
  // 玩家头像
  avatar: { type: String, default: '' },
  // 总共28的次数
  count28: { type: Number, default: 0 },
  // 盈利
  gain: { type: Number, default: 0 },
  // 最后清空盈利时间
  lastClearTime: { type: Number, default: 0 },
})

export default model('user', ModelUser);