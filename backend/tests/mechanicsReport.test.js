import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Mechanic = require('../models/mechanic');
const dashboardController = require('../controllers/adminControllers/dashboardController');

describe('admin mechanics report aggregation', () => {
  afterEach(() => vi.restoreAllMocks());

  it('joins the service request collection by mechanic references and sums completed labor fees', async () => {
    const aggregate = vi.spyOn(Mechanic, 'aggregate').mockResolvedValue([]);
    const response = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis()
    };
    await dashboardController.getMechanicsReport({}, response);

    const pipeline = aggregate.mock.calls[0][0];
    expect(pipeline[0]).toEqual({ $match: { isActive: { $ne: false } } });
    const lookup = pipeline[1].$lookup;
    const match = lookup.pipeline[0].$match;
    const group = lookup.pipeline[1].$group;
    const project = pipeline[2].$project;

    expect(lookup.from).toBe('servicerequests');
    expect(match.$expr.$or).toEqual([
      { $eq: ['$mechanic', '$$mechanicId'] },
      { $eq: ['$mechanicId', '$$mechanicId'] }
    ]);
    expect(group.completedJobs.$sum.$cond).toEqual([
      { $eq: ['$status', 'completed'] },
      1,
      0
    ]);
    expect(group.totalLabor.$sum.$cond).toEqual([
      { $eq: ['$status', 'completed'] },
      { $ifNull: ['$laborFee', 0] },
      0
    ]);
    expect(project.name).toEqual({
      $trim: { input: { $concat: ['$firstName', ' ', '$lastName'] } }
    });
    expect(project.specialty).toBe('$specialization');
    expect(response.json).toHaveBeenCalledWith({ success: true, data: [] });
  });
});
