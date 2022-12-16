
import ModelConfigRoom from "../models/ModelConfigRoom"
import ModelUser from "../models/ModelUser";

async function initRoomConfig() {
  const configRoom = [
    {
      id: 1,
      name: '初級房',
      basicChip: 20000,
      // 加注列表
      chipList: [20000, 40000, 60000, 200000, 400000],
      // 茶水费，入场就扣掉的钱
      teaMoney: 1000,
      // 最低入场需要金额
      min: 1000,
      // 最高入场金额
      max: 20000,
    },
    {
      id: 2,
      name: '中級房',
      basicChip: 40000,
      // 加注列表
      chipList: [40000, 60000, 200000, 400000],
      // 茶水费，入场就扣掉的钱
      teaMoney: 10000,
      // 最低入场需要金额
      min: 10000,
      // 最高入场金额
      max: 20000,
    },
    {
      id: 3,
      name: '高級房',
      basicChip: 40000,
      // 加注列表
      chipList: [40000, 60000, 200000, 400000],
      // 茶水费，入场就扣掉的钱
      teaMoney: 10000,
      // 最低入场需要金额
      min: 10000,
      // 最高入场金额
      max: 20000000,
    },
    {
      id: 4,
      name: '大師房',
      basicChip: 40000,
      // 加注列表
      chipList: [40000, 60000, 200000, 400000],
      // 茶水费，入场就扣掉的钱
      teaMoney: 10000,
      // 最低入场需要金额
      min: 10000,
      // 最高入场金额
      max: 200000000,
    },
  ];
  await ModelConfigRoom.deleteMany();
  await ModelConfigRoom.create(configRoom)
}





async function initUser() {
  let listUser = [
    { tagCheat: true, coin: 200000, uid: '111', nickname: '钱最多', avatar: 'https://img0.baidu.com/it/u=16966295,3736937037&fm=253&fmt=auto&app=138&f=JPEG?w=500&h=500' },
    { tagCheat: false, coin: 300000, uid: '112', nickname: '钱很少', avatar: 'https://img2.baidu.com/it/u=2078308964,2142755897&fm=253&fmt=auto&app=138&f=JPEG?w=400&h=400' },
    { tagCheat: false, coin: 10000000, uid: '113', nickname: '钱很多', avatar: 'https://img2.baidu.com/it/u=2391726625,2951775714&fm=253&fmt=auto&app=138&f=JPEG?w=500&h=500' },
    { tagCheat: false, coin: 10000000, uid: '114', nickname: '输一点', avatar: 'https://img0.baidu.com/it/u=164232245,2005229505&fm=253&fmt=auto&app=138&f=JPEG?w=400&h=400' },
    { tagCheat: false, coin: 10000000, uid: '115', nickname: '输很多', avatar: 'https://img2.baidu.com/it/u=2464854331,2113352486&fm=253&fmt=auto&app=138&f=JPEG?w=400&h=400' },
    { tagCheat: false, coin: 10000000, uid: '116', nickname: '输狂多', avatar: 'https://img2.baidu.com/it/u=80344671,2129607677&fm=253&fmt=auto&app=138&f=JPEG?w=400&h=400' },
  ];
  for (let i = 117; i < 200; i++) {
    listUser.push({
      tagCheat: false, coin: 10000000, uid: '' + i, nickname: '测试玩家' + i, avatar: 'https://img2.baidu.com/it/u=80344671,2129607677&fm=253&fmt=auto&app=138&f=JPEG?w=400&h=400'
    })
  }
  await ModelUser.deleteMany();
  ModelUser.create(listUser)
}

const createData = async () => {
  // await initRoomConfig();
  // await initUser()
}
export { createData }