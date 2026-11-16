const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true, immutable: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  actorRole: { type: String, enum: ['admin', 'customer', 'mechanic'], required: true, immutable: true },
  timestamp: { type: Date, required: true, immutable: true },
  recordType: { type: String, enum: ['reservation', 'service', 'order'], required: true, immutable: true },
  recordId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  action: { type: String, required: true, immutable: true },
  changes: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  reason: { type: String, maxlength: 300, default: '', immutable: true }
}, { versionKey: false });
schema.index({ recordType: 1, recordId: 1, timestamp: -1, _id: -1 });
module.exports = mongoose.model('AdminAudit', schema);
