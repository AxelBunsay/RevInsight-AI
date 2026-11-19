const mongoose = require('mongoose');
const AdminAudit = require('../../models/adminAudit');
const recordTypes = new Set(['reservation', 'service', 'order', 'revenue_month']);
async function getAuditHistory(req, res) {
  const { recordType, id } = req.params;
  if (!recordTypes.has(recordType) || !mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Choose a valid record.' });
  }
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const filter = { recordType, recordId: id };
    // Allow history after deletion too; deletion must not erase the audit.
    const data = await AdminAudit.find(filter).sort({ timestamp: -1, _id: -1 }).skip((page - 1) * 50).limit(50)
      .select('-__v').lean();
    const total = await AdminAudit.countDocuments(filter);
    return res.json({ success: true, data, pagination: { currentPage: page, totalPages: Math.max(1, Math.ceil(total / 50)), totalRecords: total } });
  } catch (_) {
    return res.status(500).json({ success: false, message: 'Audit history could not be loaded.' });
  }
}
module.exports = { getAuditHistory };
