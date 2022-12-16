
import { Schema, model } from 'mongoose';
const ModelConfigBasic = new Schema({
  count28: { type: Number, default: 0 },
})

export default model('configBasic', ModelConfigBasic);