import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:google_generative_ai/google_generative_ai.dart';
import 'package:unimarks/features/course/grading_engine.dart';
import 'package:unimarks/models/models.dart';

class AIService {
  static final String _apiKey = dotenv.env['GEMINI_API_KEY'] ?? '';

  static Future<String> getStudySuggestion({
    required Course course,
    required List<Category> categories,
    required List<Item> items,
  }) async {
    // 1. Try Gemini API
    if (_apiKey.isNotEmpty && _apiKey != 'your-gemini-api-key') {
      try {
        final model = GenerativeModel(model: 'gemini-pro', apiKey: _apiKey);
        final prompt = _buildPrompt(course, categories, items);
        final content = [Content.text(prompt)];
        final response = await model.generateContent(content);
        if (response.text != null && response.text!.isNotEmpty) {
          return response.text!;
        }
      } catch (e) {
        // Fallback on error
        // print('AI Error: $e');
      }
    }

    // 2. Fallback Deterministic Logic
    return _generateDetermininsticSuggestion(course, categories, items);
  }

  static String _buildPrompt(
    Course course,
    List<Category> categories,
    List<Item> items,
  ) {
    // Construct a sanitized JSON-like summary
    final currentScore = GradingEngine.computeCourseScore(
      course: course,
      categories: categories,
      items: items,
    );
    return '''
    Act as a study advisor.
    Course: ${course.title} (Target: ${course.targetPct}%).
    Current Score: ${currentScore.toStringAsFixed(1)}%.
    
    Structure:
    ${categories.map((c) => "- ${c.tag}: ${c.weightPct}% (Drop: ${c.dropRule}, Best ${c.bestOfK ?? 'All'}). Items: ${_itemsSummary(c, items)}").join('\n')}
    
    Guidance needed: How to reach the target? Be concise (max 2 sentences).
    ''';
  }

  static String _itemsSummary(Category cat, List<Item> allItems) {
    final catItems = allItems.where((i) => i.categoryId == cat.id).toList();
    final scored = catItems.where((i) => i.isCounted).length;
    final total = cat.totalN ?? (scored > 0 ? scored : 0);
    return "$scored finished out of $total declared.";
  }

  static String _generateDetermininsticSuggestion(
    Course course,
    List<Category> categories,
    List<Item> items,
  ) {
    final currentScore = GradingEngine.computeCourseScore(
      course: course,
      categories: categories,
      items: items,
    );
    final target = course.targetPct;
    final gap = target - currentScore;

    if (gap <= 0) {
      return "Great job! You are currently exceeding your target of $target%.";
    }

    // Heuristic: identify remaining weight
    // This is an approximation since Best-of-K complicates "remaining weight".
    // We'll calculate "Max Possible Score" roughly.

    return "You need to gain ${gap.toStringAsFixed(1)}% more course points. Focus on high-weight upcoming assessments.";
  }
}
