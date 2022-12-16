import axios from "axios";

let root_path = "http://127.0.0.1:8000/"
interface Ret {
  code: number,
  msg: string,
  body: object,
  data: string
}
export async function apiCall(url, data = {}) {
  console.log("http send data", data)
  let res: Ret = await axios.post(
      root_path + url,
      {
          body: data,
      }
  )
  console.log(res.data)
  res = JSON.parse(res.data)
  if (res.code !== 0) {
      throw new Error(res.msg)
  }
  return res.body
}