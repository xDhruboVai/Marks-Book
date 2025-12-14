import 'package:flutter_test/flutter_test.dart';
import 'package:unimarks/features/course/grading_engine.dart';
import 'package:unimarks/models/models.dart';

void main() {
  group('Grading Engine Tests', () {
    final mockCourse = Course(
      id: 'c1',
      ownerUid: 'u1',
      semesterId: 's1',
      code: 'CS101',
      title: 'Intro to CS',
      hasLab: false,
    );

    test('Basic Averaging Logic (avg_all)', () {
      final category = Category(
        id: 'cat1',
        ownerUid: 'u1',
        courseId: 'c1',
        tag: 'Midterm',
        weightPct: 30.0,
        dropRule: 'avg_all',
      );

      final items = [
        Item(
          id: 'i1',
          ownerUid: 'u1',
          courseId: 'c1',
          categoryId: 'cat1',
          label: 'Mid 1',
          ptsGot: 80,
          ptsMax: 100,
        ), // 80%
        Item(
          id: 'i2',
          ownerUid: 'u1',
          courseId: 'c1',
          categoryId: 'cat1',
          label: 'Mid 2',
          ptsGot: 90,
          ptsMax: 100,
        ), // 90%
      ];

      // Avg % = 85%. Weighted = 0.85 * 30 = 25.5
      final score = GradingEngine.computeCourseScore(
        course: mockCourse,
        categories: [category],
        items: items,
      );

      expect(score, closeTo(25.5, 0.01));
    });

    test('Best-of-K Logic (best_k)', () {
      final category = Category(
        id: 'cat1',
        ownerUid: 'u1',
        courseId: 'c1',
        tag: 'Quizzes',
        weightPct: 20.0,
        dropRule: 'best_k',
        bestOfK: 2,
      );

      final items = [
        Item(
          id: 'i1',
          ownerUid: 'u1',
          courseId: 'c1',
          categoryId: 'cat1',
          label: 'Q1',
          ptsGot: 60,
          ptsMax: 100,
        ), // 60
        Item(
          id: 'i2',
          ownerUid: 'u1',
          courseId: 'c1',
          categoryId: 'cat1',
          label: 'Q2',
          ptsGot: 80,
          ptsMax: 100,
        ), // 80
        Item(
          id: 'i3',
          ownerUid: 'u1',
          courseId: 'c1',
          categoryId: 'cat1',
          label: 'Q3',
          ptsGot: 90,
          ptsMax: 100,
        ), // 90
        Item(
          id: 'i4',
          ownerUid: 'u1',
          courseId: 'c1',
          categoryId: 'cat1',
          label: 'Q4',
          ptsGot: 70,
          ptsMax: 100,
        ), // 70
      ];
      // Top 2: 90, 80. Avg = 85. Weighted = 0.85 * 20 = 17.0

      final score = GradingEngine.computeCourseScore(
        course: mockCourse,
        categories: [category],
        items: items,
      );

      expect(score, closeTo(17.0, 0.01));
    });

    test('Best-of-K with fewer items than K', () {
      final category = Category(
        id: 'cat1',
        ownerUid: 'u1',
        courseId: 'c1',
        tag: 'Quizzes',
        weightPct: 20.0,
        dropRule: 'best_k',
        bestOfK: 3,
      );

      final items = [
        Item(
          id: 'i1',
          ownerUid: 'u1',
          courseId: 'c1',
          categoryId: 'cat1',
          label: 'Q1',
          ptsGot: 80,
          ptsMax: 100,
        ), // 80
        Item(
          id: 'i2',
          ownerUid: 'u1',
          courseId: 'c1',
          categoryId: 'cat1',
          label: 'Q2',
          ptsGot: 90,
          ptsMax: 100,
        ), // 90
      ];
      // Available: 80, 90. Logic: Compute over available. Avg = 85. Weighted = 17.0

      final score = GradingEngine.computeCourseScore(
        course: mockCourse,
        categories: [category],
        items: items,
      );

      expect(score, closeTo(17.0, 0.01));
    });

    test('Lab Structure Logic', () {
      final courseWithLab = Course(
        id: 'c2',
        ownerUid: 'u1',
        semesterId: 's1',
        code: 'PHY101',
        title: 'Physics',
        hasLab: true,
        labWeightPct: 20.0, // Lab is 20% of total
      );

      final labCat1 = Category(
        id: 'l1',
        ownerUid: 'u1',
        courseId: 'c2',
        tag: 'Lab Quiz',
        weightPct: 50.0, // 50% of Lab
        isInLab: true,
      );

      final labCat2 = Category(
        id: 'l2',
        ownerUid: 'u1',
        courseId: 'c2',
        tag: 'Lab Assign',
        weightPct: 50.0, // 50% of Lab
        isInLab: true,
      );

      final regularCat = Category(
        id: 'r1',
        ownerUid: 'u1',
        courseId: 'c2',
        tag: 'Final',
        weightPct: 80.0, // Remaining 80% of course
      );

      final items = [
        // Lab Quiz: 100%
        Item(
          id: 'i1',
          ownerUid: 'u1',
          courseId: 'c2',
          categoryId: 'l1',
          label: 'LQ1',
          ptsGot: 10,
          ptsMax: 10,
        ),
        // Lab Assign: 80%
        Item(
          id: 'i2',
          ownerUid: 'u1',
          courseId: 'c2',
          categoryId: 'l2',
          label: 'LA1',
          ptsGot: 8,
          ptsMax: 10,
        ),
        // Final: 90%
        Item(
          id: 'i3',
          ownerUid: 'u1',
          courseId: 'c2',
          categoryId: 'r1',
          label: 'Final',
          ptsGot: 90,
          ptsMax: 100,
        ),
      ];

      // Lab Calculation:
      // LQ Score: 100%. Contribution to Lab = 100 * 0.5 = 50.
      // LA Score: 80%. Contribution to Lab = 80 * 0.5 = 40.
      // Total Lab Composite = 90.
      // Lab contribution to Course = 90 * 0.20 = 18.0.

      // Regular Calculation:
      // Final Score: 90%. Contribution to Course = 90 * 0.80 = 72.0.

      // Total Course = 72.0 + 18.0 = 90.0.

      final score = GradingEngine.computeCourseScore(
        course: courseWithLab,
        categories: [labCat1, labCat2, regularCat],
        items: items,
      );

      expect(score, closeTo(90.0, 0.01));
    });
  });
}
