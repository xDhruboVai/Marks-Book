const express = require('express');
const { getSupabaseClient } = require('../supabase');

const router = express.Router();

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY_CURRENT_TERM_NAME = 'Current';
const LEGACY_IMPORTED_TERM_PREFIX = 'Current_Imported';

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data, error: null });
}

function fail(res, status, message, details = null) {
  return res.status(status).json({
    success: false,
    data: null,
    error: {
      message,
      details,
    },
  });
}

function validateTermName(termName) {
  if (typeof termName !== 'string') {
    return 'term_name must be a string';
  }

  const trimmed = termName.trim();
  if (!trimmed) {
    return 'term_name is required';
  }

  if (trimmed.length > 80) {
    return 'term_name must be at most 80 characters';
  }

  return null;
}

function validateLinkedSemesterId(linkedSemesterId) {
  if (linkedSemesterId === undefined || linkedSemesterId === null) {
    return null;
  }

  if (!Number.isInteger(linkedSemesterId) || linkedSemesterId <= 0) {
    return 'linked_semester_id must be a positive integer or null';
  }

  return null;
}

function parseTermId(rawTermId) {
  const parsed = Number(rawTermId);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function isValidUserId(userId) {
  return typeof userId === 'string' && UUID_REGEX.test(userId);
}

function parseCourseIds(rawCourseIds) {
  if (!Array.isArray(rawCourseIds)) {
    return [];
  }

  const seen = new Set();
  const parsedIds = [];

  for (const rawId of rawCourseIds) {
    const parsed = Number(rawId);
    if (!Number.isInteger(parsed) || parsed <= 0 || seen.has(parsed)) {
      continue;
    }

    seen.add(parsed);
    parsedIds.push(parsed);
  }

  return parsedIds;
}

function normalizeCourseKey(courseCode) {
  return String(courseCode || '').trim().toLowerCase();
}

function clampTermName(termName, suffix = '') {
  const base = String(termName || '').trim();
  const maxLength = 80;
  const suffixText = String(suffix || '');

  if (base.length + suffixText.length <= maxLength) {
    return `${base}${suffixText}`;
  }

  const allowedBaseLength = Math.max(1, maxLength - suffixText.length);
  return `${base.slice(0, allowedBaseLength)}${suffixText}`;
}

async function rollbackImportedCourseGraph(supabase, courseId) {
  const { data: insertedAssessments, error: insertedAssessmentsError } = await supabase
    .from('marks_assessments')
    .select('id')
    .eq('course_id', courseId);

  if (insertedAssessmentsError) {
    throw new Error(`Rollback failed while checking assessments: ${insertedAssessmentsError.message}`);
  }

  const assessmentIds = (insertedAssessments || []).map((assessment) => assessment.id);

  if (assessmentIds.length) {
    const { error: deleteScoresError } = await supabase
      .from('marks_scores')
      .delete()
      .in('assessment_id', assessmentIds);

    if (deleteScoresError) {
      throw new Error(`Rollback failed while deleting scores: ${deleteScoresError.message}`);
    }

    const { error: deleteAssessmentsError } = await supabase
      .from('marks_assessments')
      .delete()
      .in('id', assessmentIds);

    if (deleteAssessmentsError) {
      throw new Error(`Rollback failed while deleting assessments: ${deleteAssessmentsError.message}`);
    }
  }

  const { error: deleteCourseError } = await supabase
    .from('marks_courses')
    .delete()
    .eq('id', courseId);

  if (deleteCourseError) {
    throw new Error(`Rollback failed while deleting course: ${deleteCourseError.message}`);
  }
}

async function getUniqueTermNameForUser(supabase, userId, baseTermName) {
  const { data, error } = await supabase
    .from('marks_terms')
    .select('term_name')
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Could not check existing terms: ${error.message}`);
  }

  const existingNames = new Set(
    (data || []).map((item) => String(item.term_name || '').trim().toLowerCase())
  );

  const cleanedBaseName = clampTermName(baseTermName);
  if (!existingNames.has(cleanedBaseName.toLowerCase())) {
    return cleanedBaseName;
  }

  let attempt = 2;
  while (attempt < 5000) {
    const suffix = ` (${attempt})`;
    const candidate = clampTermName(cleanedBaseName, suffix);
    if (!existingNames.has(candidate.toLowerCase())) {
      return candidate;
    }
    attempt += 1;
  }

  throw new Error('Could not generate a unique term name');
}

router.post('/terms', async (req, res) => {
  try {
    const { user_id: userId, term_name: termName, linked_semester_id: linkedSemesterId = null } = req.body || {};

    if (!userId || !UUID_REGEX.test(userId)) {
      return fail(res, 400, 'user_id must be a valid UUID');
    }

    const termNameError = validateTermName(termName);
    if (termNameError) {
      return fail(res, 400, termNameError);
    }

    const linkedSemesterError = validateLinkedSemesterId(linkedSemesterId);
    if (linkedSemesterError) {
      return fail(res, 400, linkedSemesterError);
    }

    const supabase = getSupabaseClient();

    const payload = {
      user_id: userId,
      term_name: termName.trim(),
      linked_semester_id: linkedSemesterId,
    };

    const { data, error } = await supabase
      .from('marks_terms')
      .insert(payload)
      .select('id, user_id, term_name, linked_semester_id, created_at, updated_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        return fail(res, 409, 'Term name already exists for this user', error.message);
      }
      return fail(res, 500, 'Failed to create term', error.message);
    }

    return ok(res, data, 201);
  } catch (err) {
    return fail(res, 500, 'Unexpected server error', err.message);
  }
});

router.get('/terms/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!UUID_REGEX.test(userId)) {
      return fail(res, 400, 'userId must be a valid UUID');
    }

    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('marks_terms')
      .select('id, user_id, term_name, linked_semester_id, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return fail(res, 500, 'Failed to fetch terms', error.message);
    }

    return ok(res, data || []);
  } catch (err) {
    return fail(res, 500, 'Unexpected server error', err.message);
  }
});

router.get('/semesters/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!UUID_REGEX.test(userId)) {
      return fail(res, 400, 'userId must be a valid UUID');
    }

    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('semesters')
      .select('id, user_id, name, term_index, term_gpa, term_credits, cumulative_cgpa')
      .eq('user_id', userId)
      .order('term_index', { ascending: false })
      .order('id', { ascending: false });

    if (error) {
      return fail(res, 500, 'Failed to fetch semesters', error.message);
    }

    return ok(res, data || []);
  } catch (err) {
    return fail(res, 500, 'Unexpected server error', err.message);
  }
});

router.get('/courses/current/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!UUID_REGEX.test(userId)) {
      return fail(res, 400, 'userId must be a valid UUID');
    }

    const supabase = getSupabaseClient();

    const { data: courses, error: coursesError } = await supabase
      .from('marks_courses')
      .select('id, user_id, course_code, title, credit, target_grade, term_name, created_at, updated_at')
      .eq('user_id', userId)
      .eq('term_name', LEGACY_CURRENT_TERM_NAME)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

    if (coursesError) {
      return fail(res, 500, 'Failed to fetch current semester courses', coursesError.message);
    }

    if (!courses || !courses.length) {
      return ok(res, []);
    }

    const courseIds = courses.map((course) => course.id);

    const { data: assessments, error: assessmentsError } = await supabase
      .from('marks_assessments')
      .select('id, course_id')
      .in('course_id', courseIds);

    if (assessmentsError) {
      return fail(res, 500, 'Failed to fetch course assessments', assessmentsError.message);
    }

    const assessmentsByCourse = new Map();
    for (const assessment of assessments || []) {
      const nextCount = (assessmentsByCourse.get(assessment.course_id) || 0) + 1;
      assessmentsByCourse.set(assessment.course_id, nextCount);
    }

    const assessmentIds = (assessments || []).map((assessment) => assessment.id);
    let scoresByAssessment = new Map();

    if (assessmentIds.length) {
      const { data: scores, error: scoresError } = await supabase
        .from('marks_scores')
        .select('id, assessment_id')
        .in('assessment_id', assessmentIds);

      if (scoresError) {
        return fail(res, 500, 'Failed to fetch assessment scores', scoresError.message);
      }

      scoresByAssessment = new Map();
      for (const score of scores || []) {
        const nextCount = (scoresByAssessment.get(score.assessment_id) || 0) + 1;
        scoresByAssessment.set(score.assessment_id, nextCount);
      }
    }

    const scoresByCourse = new Map();
    for (const assessment of assessments || []) {
      const nextCount =
        (scoresByCourse.get(assessment.course_id) || 0) +
        (scoresByAssessment.get(assessment.id) || 0);
      scoresByCourse.set(assessment.course_id, nextCount);
    }

    const response = courses.map((course) => ({
      ...course,
      assessments_count: assessmentsByCourse.get(course.id) || 0,
      scores_count: scoresByCourse.get(course.id) || 0,
    }));

    return ok(res, response);
  } catch (err) {
    return fail(res, 500, 'Unexpected server error', err.message);
  }
});

router.post('/courses/import', async (req, res) => {
  try {
    const {
      user_id: userId,
      course_ids: rawCourseIds,
      target_mode: rawTargetMode = 'auto-create',
      target_term_id: rawTargetTermId = null,
      new_term_name: rawNewTermName = '',
    } = req.body || {};

    if (!isValidUserId(userId)) {
      return fail(res, 400, 'user_id must be a valid UUID');
    }

    const selectedCourseIds = parseCourseIds(rawCourseIds);
    if (!selectedCourseIds.length) {
      return fail(res, 400, 'course_ids must contain at least one valid positive integer');
    }

    const targetMode = rawTargetMode === 'existing' ? 'existing' : 'auto-create';
    const targetTermId = parseTermId(rawTargetTermId);
    if (targetMode === 'existing' && !targetTermId) {
      return fail(res, 400, 'target_term_id must be a positive integer when target_mode is existing');
    }

    if (rawNewTermName !== undefined && rawNewTermName !== null && typeof rawNewTermName !== 'string') {
      return fail(res, 400, 'new_term_name must be a string');
    }

    const supabase = getSupabaseClient();

    const { data: sourceCourses, error: sourceCoursesError } = await supabase
      .from('marks_courses')
      .select('id, user_id, course_code, title, credit, target_grade, term_name, created_at, updated_at')
      .eq('user_id', userId)
      .eq('term_name', LEGACY_CURRENT_TERM_NAME)
      .in('id', selectedCourseIds)
      .order('id', { ascending: true });

    if (sourceCoursesError) {
      return fail(res, 500, 'Failed to fetch selected source courses', sourceCoursesError.message);
    }

    if (!sourceCourses || !sourceCourses.length) {
      return fail(res, 404, 'No importable current semester courses found for selected IDs');
    }

    let targetTerm = null;

    if (targetMode === 'existing') {
      const { data: existingTerm, error: existingTermError } = await supabase
        .from('marks_terms')
        .select('id, user_id, term_name, linked_semester_id, created_at, updated_at')
        .eq('id', targetTermId)
        .eq('user_id', userId)
        .maybeSingle();

      if (existingTermError) {
        return fail(res, 500, 'Failed to fetch target term', existingTermError.message);
      }

      if (!existingTerm) {
        return fail(res, 404, 'Target term not found for this user');
      }

      targetTerm = existingTerm;
    } else {
      let linkedSemesterId = null;
      let baseTermName = String(rawNewTermName || '').trim();

      if (!baseTermName) {
        const { data: latestSemester, error: latestSemesterError } = await supabase
          .from('semesters')
          .select('id, name')
          .eq('user_id', userId)
          .order('term_index', { ascending: false })
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestSemesterError) {
          return fail(res, 500, 'Failed to fetch latest semester', latestSemesterError.message);
        }

        if (latestSemester?.id) {
          linkedSemesterId = latestSemester.id;
        }

        if (latestSemester?.name) {
          baseTermName = `${latestSemester.name} Import`;
        } else {
          const today = new Date().toISOString().slice(0, 10);
          baseTermName = `Current Semester Import ${today}`;
        }
      }

      const termNameError = validateTermName(baseTermName);
      if (termNameError) {
        return fail(res, 400, termNameError);
      }

      const uniqueTermName = await getUniqueTermNameForUser(supabase, userId, baseTermName);

      const { data: createdTerm, error: createTermError } = await supabase
        .from('marks_terms')
        .insert({
          user_id: userId,
          term_name: uniqueTermName,
          linked_semester_id: linkedSemesterId,
        })
        .select('id, user_id, term_name, linked_semester_id, created_at, updated_at')
        .single();

      if (createTermError) {
        return fail(res, 500, 'Failed to create target term', createTermError.message);
      }

      targetTerm = createdTerm;
    }

    const sourceCoursesById = new Map(sourceCourses.map((course) => [course.id, course]));
    const orderedSourceCourses = selectedCourseIds
      .map((courseId) => sourceCoursesById.get(courseId))
      .filter(Boolean);

    const { data: existingTargetCourses, error: existingTargetCoursesError } = await supabase
      .from('marks_courses')
      .select('id, course_code')
      .eq('user_id', userId)
      .eq('term_name', targetTerm.term_name);

    if (existingTargetCoursesError) {
      return fail(res, 500, 'Failed to fetch existing target term courses', existingTargetCoursesError.message);
    }

    const existingCourseKeys = new Set(
      (existingTargetCourses || [])
        .map((course) => normalizeCourseKey(course.course_code))
        .filter(Boolean)
    );

    const importedCourses = [];
    const skippedCourses = [];
    const failedCourses = [];
    const migratedSourceCourseIds = [];
    const nowIso = new Date().toISOString();

    for (const sourceCourse of orderedSourceCourses) {
      const courseKey = normalizeCourseKey(sourceCourse.course_code);

      if (courseKey && existingCourseKeys.has(courseKey)) {
        skippedCourses.push({
          source_course_id: sourceCourse.id,
          course_code: sourceCourse.course_code,
          reason: 'Course already exists in target term',
        });
        continue;
      }

      const { data: createdCourse, error: createdCourseError } = await supabase
        .from('marks_courses')
        .insert({
          user_id: userId,
          course_code: sourceCourse.course_code,
          title: sourceCourse.title,
          credit: sourceCourse.credit,
          term_name: targetTerm.term_name,
          target_grade: sourceCourse.target_grade,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select('id, user_id, course_code, title, credit, term_name, target_grade, created_at, updated_at')
        .single();

      if (createdCourseError || !createdCourse) {
        failedCourses.push({
          source_course_id: sourceCourse.id,
          course_code: sourceCourse.course_code,
          reason: createdCourseError?.message || 'Failed to create target course',
        });
        continue;
      }

      if (courseKey) {
        existingCourseKeys.add(courseKey);
      }

      const { data: sourceAssessments, error: sourceAssessmentsError } = await supabase
        .from('marks_assessments')
        .select('id, name, weight, max_points, due_date, order_index')
        .eq('course_id', sourceCourse.id)
        .order('order_index', { ascending: true })
        .order('id', { ascending: true });

      if (sourceAssessmentsError) {
        try {
          await rollbackImportedCourseGraph(supabase, createdCourse.id);
        } catch (rollbackError) {
          return fail(
            res,
            500,
            'Import rollback failed after assessment fetch error',
            rollbackError.message
          );
        }
        failedCourses.push({
          source_course_id: sourceCourse.id,
          course_code: sourceCourse.course_code,
          reason: sourceAssessmentsError.message,
        });
        continue;
      }

      const assessmentsToInsert = (sourceAssessments || []).map((assessment) => ({
        course_id: createdCourse.id,
        name: assessment.name,
        weight: assessment.weight,
        max_points: assessment.max_points,
        due_date: assessment.due_date,
        order_index: assessment.order_index,
        created_at: nowIso,
        updated_at: nowIso,
      }));

      let insertedAssessments = [];
      if (assessmentsToInsert.length) {
        const { data: insertedAssessmentRows, error: insertAssessmentsError } = await supabase
          .from('marks_assessments')
          .insert(assessmentsToInsert)
          .select('id');

        if (insertAssessmentsError) {
          try {
            await rollbackImportedCourseGraph(supabase, createdCourse.id);
          } catch (rollbackError) {
            return fail(
              res,
              500,
              'Import rollback failed after assessments insert error',
              rollbackError.message
            );
          }
          failedCourses.push({
            source_course_id: sourceCourse.id,
            course_code: sourceCourse.course_code,
            reason: insertAssessmentsError.message,
          });
          continue;
        }

        insertedAssessments = insertedAssessmentRows || [];
      }

      const oldAssessmentIds = (sourceAssessments || []).map((assessment) => assessment.id);
      const assessmentIdMap = new Map();
      oldAssessmentIds.forEach((oldId, index) => {
        const newId = insertedAssessments[index]?.id;
        if (newId) {
          assessmentIdMap.set(oldId, newId);
        }
      });

      let insertedScoresCount = 0;
      if (oldAssessmentIds.length) {
        const { data: sourceScores, error: sourceScoresError } = await supabase
          .from('marks_scores')
          .select('assessment_id, points_scored, submitted_at, is_dropped')
          .in('assessment_id', oldAssessmentIds)
          .order('id', { ascending: true });

        if (sourceScoresError) {
          try {
            await rollbackImportedCourseGraph(supabase, createdCourse.id);
          } catch (rollbackError) {
            return fail(
              res,
              500,
              'Import rollback failed after source scores fetch error',
              rollbackError.message
            );
          }
          failedCourses.push({
            source_course_id: sourceCourse.id,
            course_code: sourceCourse.course_code,
            reason: sourceScoresError.message,
          });
          continue;
        }

        const scoresToInsert = (sourceScores || [])
          .map((score) => ({
            assessment_id: assessmentIdMap.get(score.assessment_id),
            points_scored: score.points_scored,
            submitted_at: score.submitted_at,
            is_dropped: score.is_dropped,
          }))
          .filter((score) => Number.isInteger(score.assessment_id));

        if (scoresToInsert.length) {
          const { data: insertedScores, error: insertScoresError } = await supabase
            .from('marks_scores')
            .insert(scoresToInsert)
            .select('id');

          if (insertScoresError) {
            try {
              await rollbackImportedCourseGraph(supabase, createdCourse.id);
            } catch (rollbackError) {
              return fail(
                res,
                500,
                'Import rollback failed after scores insert error',
                rollbackError.message
              );
            }
            failedCourses.push({
              source_course_id: sourceCourse.id,
              course_code: sourceCourse.course_code,
              reason: insertScoresError.message,
            });
            continue;
          }

          insertedScoresCount = (insertedScores || []).length;
        }
      }

      importedCourses.push({
        ...createdCourse,
        source_course_id: sourceCourse.id,
        assessments_count: insertedAssessments.length,
        scores_count: insertedScoresCount,
      });
      migratedSourceCourseIds.push(sourceCourse.id);
    }

    if (migratedSourceCourseIds.length) {
      const migrationMarker = clampTermName(
        `${LEGACY_IMPORTED_TERM_PREFIX}_${targetTerm.id}`
      );

      const { error: migrationError } = await supabase
        .from('marks_courses')
        .update({
          term_name: migrationMarker,
          updated_at: nowIso,
        })
        .eq('user_id', userId)
        .eq('term_name', LEGACY_CURRENT_TERM_NAME)
        .in('id', migratedSourceCourseIds);

      if (migrationError) {
        return fail(res, 500, 'Import succeeded but failed to mark source rows as migrated', migrationError.message);
      }
    }

    return ok(
      res,
      {
        target_term: targetTerm,
        imported_courses: importedCourses,
        skipped_courses: skippedCourses,
        failed_courses: failedCourses,
        migrated_source_course_ids: migratedSourceCourseIds,
        summary: {
          requested_course_count: selectedCourseIds.length,
          imported_count: importedCourses.length,
          skipped_count: skippedCourses.length,
          failed_count: failedCourses.length,
        },
      },
      importedCourses.length ? 201 : 200
    );
  } catch (err) {
    return fail(res, 500, 'Unexpected server error', err.message);
  }
});

router.put('/terms/:termId', async (req, res) => {
  try {
    const termId = parseTermId(req.params.termId);
    if (!termId) {
      return fail(res, 400, 'termId must be a positive integer');
    }

    const { term_name: termName, linked_semester_id: linkedSemesterId = null } = req.body || {};

    const termNameError = validateTermName(termName);
    if (termNameError) {
      return fail(res, 400, termNameError);
    }

    const linkedSemesterError = validateLinkedSemesterId(linkedSemesterId);
    if (linkedSemesterError) {
      return fail(res, 400, linkedSemesterError);
    }

    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('marks_terms')
      .update({
        term_name: termName.trim(),
        linked_semester_id: linkedSemesterId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', termId)
      .select('id, user_id, term_name, linked_semester_id, created_at, updated_at')
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        return fail(res, 409, 'Term name already exists for this user', error.message);
      }
      return fail(res, 500, 'Failed to update term', error.message);
    }

    if (!data) {
      return fail(res, 404, 'Term not found');
    }

    return ok(res, data);
  } catch (err) {
    return fail(res, 500, 'Unexpected server error', err.message);
  }
});

router.delete('/terms/:termId', async (req, res) => {
  try {
    const termId = parseTermId(req.params.termId);
    if (!termId) {
      return fail(res, 400, 'termId must be a positive integer');
    }

    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('marks_terms')
      .delete()
      .eq('id', termId)
      .select('id')
      .maybeSingle();

    if (error) {
      return fail(res, 500, 'Failed to delete term', error.message);
    }

    if (!data) {
      return fail(res, 404, 'Term not found');
    }

    return ok(res, { id: data.id, message: 'Term deleted' });
  } catch (err) {
    return fail(res, 500, 'Unexpected server error', err.message);
  }
});

module.exports = router;
