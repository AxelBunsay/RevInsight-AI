const Product = require('../../models/product');
const ServiceRequest = require('../../models/serviceRequest');
const { transitionServiceRequestStatus } = require('../serviceRequestController');
const { getAvailableStock, isLowStock } = require('../../utils/inventory');

const serializeMechanicPart = (product, { host, protocol }) => {
  const available = getAvailableStock(product);
  const image = product.imageUrl || product.image || null;
  const imageUrl = image && !/^https?:\/\//i.test(image)
    ? `${protocol}://${host}/${image}`
    : image;
  return {
    itemId: product._id.toString(),
    name: product.name,
    stock: available,
    category: product.category,
    price: product.price,
    isOutOfStock: available <= 0,
    stockStatus: available <= 0 ? 'Out of Stock' : isLowStock(available) ? 'Low Stock' : 'In Stock',
    image: imageUrl
  };
};

const summarizeMechanicJobs = (jobs) => {
  const completed = jobs.filter((job) => job.status === 'completed');
  return {
    totalJobs: jobs.length,
    scheduledJobs: jobs.filter((job) => ['assigned', 'confirmed', 'accepted'].includes(job.status)).length,
    inProgressJobs: jobs.filter((job) => job.status === 'in-progress').length,
    completedJobs: completed.length,
    totalEarnings: completed.reduce((total, job) => total + Number(job.laborFee || 0), 0),
    paidJobs: completed.length
  };
};

const serializeServiceRequest = (request) => {
  const user = request.user;
  const customerName = user
    ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
    : 'Customer';

  return {
    _id: request._id,
    id: request._id,
    customerName,
    customerEmail: user?.email || '',
    serviceType: request.serviceType,
    serviceDescription: request.description,
    description: request.description,
    status: request.status,
    mechanic: request.mechanic,
    startTime: request.startTime,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    requestDate: request.createdAt,
    scheduledDate: request.updatedAt
  };
};

// Public endpoint for mechanics to fetch parts
const getPartsForMechanic = async (req, res) => {
  try {
    const products = await Product.find({ isActive: { $ne: false } });

    const host = req.get('host');
    const protocol = req.protocol;

    const parts = products.map((product) => serializeMechanicPart(product, { host, protocol }));

    res.status(200).json(parts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getPendingServiceRequests = async (req, res) => {
  try {
    const requests = await ServiceRequest.find({ status: 'pending', mechanic: null })
      .populate('user')
      .sort({ createdAt: -1 });

    res.status(200).json(requests.map(serializeServiceRequest));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const acceptServiceRequest = async (req, res) => {
  try {
    const requestId = req.params.requestId;
    const mechanicId = req.user?.userId;

    if (!mechanicId) return res.status(400).json({ message: 'Mechanic id required' });

    const request = await ServiceRequest.findById(requestId).populate('user');
    if (!request) return res.status(404).json({ message: 'Service request not found' });
    if (request.status !== 'confirmed' || request.mechanic?.toString() !== mechanicId) {
      return res.status(400).json({ message: 'Service request is not available for acceptance.' });
    }

    request.mechanic = mechanicId;
    request.status = 'in-progress';
    request.startTime = req.body.startTime || request.startTime;
    await request.save();

    res.status(200).json({ message: 'Service request accepted', serviceRequest: serializeServiceRequest(request) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getAvailableJobs = async (req, res) => {
  try {
    const jobs = await ServiceRequest.find({ status: 'confirmed', mechanic: req.user.userId })
      .populate('user')
      .sort({ createdAt: -1 });

    res.status(200).json(jobs.map(serializeServiceRequest));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMechanicJobsById = async (req, res) => {
  try {
    const mechanicId = req.params.mechanicId || req.user?.userId;
    if (!mechanicId) return res.status(400).json({ message: 'Mechanic id required' });

    if (req.params.mechanicId && req.params.mechanicId !== req.user?.userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const jobs = await ServiceRequest.find({ mechanic: mechanicId }).populate('user').sort({ updatedAt: -1 });
    res.status(200).json(jobs.map(serializeServiceRequest));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMechanicStats = async (req, res) => {
  try {
    const mechanicId = req.params.mechanicId || req.user?.userId;
    if (!mechanicId) return res.status(400).json({ message: 'Mechanic id required' });

    if (req.params.mechanicId && req.params.mechanicId !== req.user?.userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const jobs = await ServiceRequest.find({ $or: [{ mechanic: mechanicId }, { mechanicId }] });
    res.status(200).json(summarizeMechanicJobs(jobs));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const acceptMechanicJob = async (req, res) => {
  try {
    const currentJob = await ServiceRequest.findById(req.params.jobId);
    if (!currentJob) return res.status(404).json({ message: 'Service request not found' });
    const status = currentJob.status === 'pending' && !currentJob.mechanic && !currentJob.mechanicId
      ? 'assigned'
      : 'accepted';
    const job = await transitionServiceRequestStatus({
      requestId: req.params.jobId,
      mechanicId: req.user?.userId,
      status,
      requirePayment: true
    });
    res.status(200).json({ message: 'Job accepted', job: serializeServiceRequest(job) });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    res.status(500).json({ message: error.message });
  }
};

const startMechanicJob = async (req, res) => {
  try {
    const job = await transitionServiceRequestStatus({
      requestId: req.params.jobId,
      mechanicId: req.user?.userId,
      status: 'in-progress'
    });
    res.status(200).json({ message: 'Job started', job: serializeServiceRequest(job) });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    res.status(500).json({ message: error.message });
  }
};

const completeMechanicJob = async (req, res) => {
  try {
    const job = await transitionServiceRequestStatus({
      requestId: req.params.jobId,
      mechanicId: req.user?.userId,
      status: 'completed'
    });
    res.status(200).json({ message: 'Job completed', job: serializeServiceRequest(job) });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getPartsForMechanic,
  getPendingServiceRequests,
  acceptServiceRequest,
  getAvailableJobs,
  getMechanicJobsById,
  getMechanicStats,
  acceptMechanicJob,
  startMechanicJob,
  completeMechanicJob,
  summarizeMechanicJobs,
  serializeMechanicPart
};
