import 'package:unimarks/models/models.dart';
import 'dart:math';

class GradingEngine {
  /// Computes the comprehensive course score.
  /// Returns a value between 0.0 and 100.0.
  static double computeCourseScore({
    required Course course,
    required List<Category> categories,
    required List<Item> items,
  }) {
    double totalScore = 0.0;

    // Separate Lab categories from Regular categories
    final labCategories = categories.where((c) => c.isInLab).toList();
    final regularCategories = categories.where((c) => !c.isInLab).toList();

    // 1. Calculate Regular Categories Contribution
    for (var cat in regularCategories) {
      double catScore = _calculateCategoryScore(cat, items);
      totalScore += catScore * (cat.weightPct / 100.0);
    }

    // 2. Calculate Lab Contribution (if course has lab)
    if (course.hasLab && labCategories.isNotEmpty) {
      double labTotalScore = 0.0;

      for (var cat in labCategories) {
        double catScore = _calculateCategoryScore(cat, items);
        labTotalScore += catScore * (cat.weightPct / 100.0);
      }

      // Weight of Lab in Course
      totalScore += labTotalScore * (course.labWeightPct / 100.0);
    }

    return totalScore;
  }

  /// Calculates percentage score for a single category based on its rules.
  static double _calculateCategoryScore(
    Category category,
    List<Item> allItems,
  ) {
    // Filter items for this category
    final catItems = allItems
        .where((i) => i.categoryId == category.id && i.isCounted)
        .toList();

    if (catItems.isEmpty) return 0.0;

    // Calculate percentage for each item
    List<double> scores = catItems.map((i) => i.percentage).toList();

    // Sort descending for Best-of-K
    scores.sort((a, b) => b.compareTo(a));

    int k = scores.length; // Default to all

    if (category.dropRule == 'best_k') {
      if (category.bestOfK != null) {
        k = category.bestOfK!;
      } else if (category.totalN != null) {
        k = scores.length;
      }
    }

    k = min(k, scores.length);
    if (k == 0) return 0.0;

    double sumTopK = 0.0;
    for (int i = 0; i < k; i++) {
      sumTopK += scores[i];
    }

    return sumTopK / k;
  }

  static List<String> generateSuggestions({
    required Course course,
    required List<Category> categories,
    required List<Item> items,
  }) {
    List<String> suggestions = [];
    double currentScore = computeCourseScore(
      course: course,
      categories: categories,
      items: items,
    );
    double target = course.targetPct;

    if (currentScore >= target) {
      suggestions.add(
        "You are currently above your target of $target%. Keep it up!",
      );
      return suggestions;
    }

    suggestions.add("You need to score higher on remaining items.");
    return suggestions;
  }
}
