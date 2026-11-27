const mongoose = require('mongoose');
const Review = require('../../models/revenueMonthReview');
const { getQuarterReview, publicQuarterReview } = require('../../services/revenueReviewService');
const { auditSnapshot, recordAuditChange } = require('../../utils/adminAudit');

async function getQuarterCompleteness(req,res) {
  try {
    return res.json({success:true,data:publicQuarterReview(await getQuarterReview(req.query.selectedQuarter))});
  } catch (error) {
    return res.status(error.statusCode || 500).json({success:false,message:error.statusCode===400?error.message:'Quarter review could not be loaded.'});
  }
}
async function reviewMonth(req,res) {
  const { selectedQuarter, monthKey, fingerprint, confirmZeroSales } = req.body || {};
  if (typeof fingerprint!=='string' || !/^[a-f0-9]{64}$/.test(fingerprint) || typeof confirmZeroSales!=='boolean') {
    return res.status(400).json({success:false,message:'Reload the month and explicitly choose its review decision.'});
  }
  let session;
  try {
    session=await mongoose.startSession();
    await session.withTransaction(async()=>{
      const quarter=await getQuarterReview(selectedQuarter,{session});
      const month=quarter.months.find(row=>row.monthKey===monthKey);
      if (!month) throw Object.assign(new Error('Choose a month in the selected quarter.'),{statusCode:400});
      if (month.fingerprint!==fingerprint) throw Object.assign(new Error('Revenue data changed. Reload and review the month again.'),{statusCode:409});
      if (!month.canReview) throw Object.assign(new Error('Only closed months without blocking data issues can be reviewed.'),{statusCode:409});
      if (confirmZeroSales !== (month.eligibleTransactionCount===0)) throw Object.assign(new Error(month.eligibleTransactionCount===0?'Explicitly confirm zero sales for this empty closed month.':'Zero sales cannot be confirmed while eligible transactions exist.'),{statusCode:400});
      let review=await Review.findOne({monthKey}).session(session);
      if (review?.reviewedFingerprint===fingerprint && review.confirmedZeroSales===confirmZeroSales) return;
      const before=auditSnapshot(review);
      if (!review) review=new Review({monthKey});
      review.set({
        status:confirmZeroSales?'confirmed_zero_sales':'reviewed', confirmedZeroSales:confirmZeroSales,
        reviewedFingerprint:fingerprint,reviewedBy:req.admin.id,reviewedAt:new Date(),
        reviewVersion:(review.reviewVersion || 0)+1,sourceRecords:month.sourceRecords
      });
      await review.save({session});
      await recordAuditChange({req,session,recordType:'revenue_month',before,after:review,
        action:confirmZeroSales?'zero_sales_month_confirmed':'revenue_month_reviewed',reason:'Revenue review for '+monthKey});
    });
    return res.json({success:true,data:publicQuarterReview(await getQuarterReview(selectedQuarter))});
  } catch (error) {
    const duplicate=error.code===11000;
    return res.status(error.statusCode || (duplicate?409:500)).json({success:false,message:error.statusCode?error.message:duplicate?'Another review was saved. Reload this quarter.':'Month review could not be saved.'});
  } finally {
    if (session) await session.endSession();
  }
}
module.exports={getQuarterCompleteness,reviewMonth};
