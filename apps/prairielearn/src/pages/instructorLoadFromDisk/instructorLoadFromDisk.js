// @ts-check
import * as path from 'path';

import * as async from 'async';
import * as express from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';

import { chalk } from '../../lib/chalk.js';
import * as chunks from '../../lib/chunks.js';
import { config } from '../../lib/config.js';
import { REPOSITORY_ROOT_PATH } from '../../lib/paths.js';
import { createServerJob } from '../../lib/server-jobs.js';
import * as syncFromDisk from '../../sync/syncFromDisk.js';

const router = express.Router();

async function update(locals) {
  const serverJob = await createServerJob({
    courseId: locals.course ? locals.course.id : null,
    type: 'loadFromDisk',
    description: 'Load data from local disk',
  });

  serverJob.executeInBackground(async (job) => {
    let anyCourseHadJsonErrors = false;
    await async.eachOfSeries(config.courseDirs || [], async (courseDir, index) => {
      courseDir = path.resolve(REPOSITORY_ROOT_PATH, courseDir);
      job.info(chalk.bold(courseDir));
      var infoCourseFile = path.join(courseDir, 'infoCourse.json');
      const hasInfoCourseFile = await fs.pathExists(infoCourseFile);
      if (!hasInfoCourseFile) {
        job.verbose('infoCourse.json not found, skipping');
        if (index !== config.courseDirs.length - 1) job.info('');
        return;
      }
      const syncResult = await syncFromDisk.syncOrCreateDiskToSql(courseDir, job);
      if (syncResult.sharingSyncError) {
        job.fail('Sync completely failed due to invalid question sharing edit.');
        return;
      }
      if (index !== config.courseDirs.length - 1) job.info('');
      if (!syncResult) throw new Error('syncOrCreateDiskToSql() returned null');
      if (syncResult.hadJsonErrors) anyCourseHadJsonErrors = true;
      if (config.chunksGenerator) {
        const chunkChanges = await chunks.updateChunksForCourse({
          coursePath: courseDir,
          courseId: syncResult.courseId,
          courseData: syncResult.courseData,
          oldHash: 'HEAD~1',
          newHash: 'HEAD',
        });
        chunks.logChunkChangesToJob(chunkChanges, job);
      }
    });

    if (anyCourseHadJsonErrors) {
      throw new Error(
        'One or more courses had JSON files that contained errors and were unable to be synced',
      );
    }
  });

  return serverJob.jobSequenceId;
}

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    if (!res.locals.devMode) return next();
    const jobSequenceId = await update(res.locals);
    res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
  }),
);

export default router;
