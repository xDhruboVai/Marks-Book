import 'package:flutter/material.dart';

import 'package:unimarks/features/course/ai_service.dart';
import 'package:unimarks/features/course/grading_engine.dart';
import 'package:unimarks/models/models.dart';
import 'package:unimarks/services/supabase_service.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class CourseScreen extends StatefulWidget {
  final String courseId;
  const CourseScreen({super.key, required this.courseId});

  @override
  State<CourseScreen> createState() => _CourseScreenState();
}

class _CourseScreenState extends State<CourseScreen> {
  Course? _course;
  List<Category> _categories = [];
  List<Item> _items = [];
  bool _loading = true;
  String? _aiSuggestion;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    final svc = SupabaseService();
    try {
      // fetch categories
      _categories = await svc.getCategories(widget.courseId);
      _items = await svc.getItems(widget.courseId);

      // Fetch course details
      final cResponse = await Supabase.instance.client
          .from('courses')
          .select()
          .eq('crs_xid', widget.courseId)
          .single();
      _course = Course.fromMap(cResponse);

      _generateAI();
    } catch (e) {
      debugPrint('Error loading course: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _generateAI() async {
    if (_course == null) return;
    final suggestion = await AIService.getStudySuggestion(
      course: _course!,
      categories: _categories,
      items: _items,
    );
    if (mounted) setState(() => _aiSuggestion = suggestion);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (_course == null) {
      return const Scaffold(body: Center(child: Text('Course not found')));
    }

    final currentScore = GradingEngine.computeCourseScore(
      course: _course!,
      categories: _categories,
      items: _items,
    );

    return Scaffold(
      appBar: AppBar(title: Text(_course!.title)),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Header Card
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    Text(
                      'Current Score',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '${currentScore.toStringAsFixed(1)}%',
                      style: Theme.of(context).textTheme.displayMedium
                          ?.copyWith(
                            color: _getScoreColor(
                              currentScore,
                              _course!.targetPct,
                            ),
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                    Text(
                      'Target: ${_course!.targetPct}%',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // AI Panel
            if (_aiSuggestion != null)
              Card(
                color: Theme.of(context).colorScheme.surfaceContainerHighest,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(
                            Icons.auto_awesome,
                            color: Theme.of(context).colorScheme.primary,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'Study Advisor',
                            style: Theme.of(context).textTheme.titleSmall,
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(_aiSuggestion!),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 16),

            // Categories
            Text('Breakdown', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            ..._categories.map((cat) {
              final catItems = _items
                  .where((i) => i.categoryId == cat.id)
                  .toList();
              // Calculate cat score average for display
              // We'll reuse grading engine logic potentially or just show items
              return ExpansionTile(
                title: Text(cat.tag),
                subtitle: Text(
                  '${cat.weightPct}% Weight • ${_getDropRuleText(cat)}',
                ),
                children: catItems
                    .map(
                      (item) => ListTile(
                        title: Text(item.label),
                        trailing: Text('${item.ptsGot}/${item.ptsMax}'),
                      ),
                    )
                    .toList(),
              );
            }),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showAddOptions(context),
        child: const Icon(Icons.add),
      ),
    );
  }

  Color _getScoreColor(double score, double target) {
    if (score >= target) return Colors.green;
    if (score >= target - 10) return Colors.orange;
    return Colors.red;
  }

  String _getDropRuleText(Category cat) {
    if (cat.dropRule == 'best_k') return 'Best ${cat.bestOfK ?? 'All'}';
    return 'Avg All';
  }

  void _showAddOptions(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: const Icon(Icons.category),
            title: const Text('Add Category'),
            subtitle: const Text('e.g. Quizzes, Labs, Exams'),
            onTap: () {
              Navigator.pop(ctx);
              _showAddCategoryDialog(context);
            },
          ),
          ListTile(
            leading: const Icon(Icons.check),
            title: const Text('Add Grade Item'),
            subtitle: const Text('e.g. Quiz 1, Midterm'),
            onTap: () {
              Navigator.pop(ctx);
              if (_categories.isEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Please add a category first.')),
                );
                return;
              }
              _showAddItemDialog(context);
            },
          ),
        ],
      ),
    );
  }

  Future<void> _showAddCategoryDialog(BuildContext context) async {
    final tagController = TextEditingController();
    final weightController = TextEditingController();

    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add Category'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: tagController,
              decoration: const InputDecoration(
                labelText: 'Category Name (e.g. Quizzes)',
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: weightController,
              decoration: const InputDecoration(labelText: 'Weight %'),
              keyboardType: TextInputType.number,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              if (tagController.text.isEmpty) return;
              try {
                final svc = SupabaseService();
                final user = svc.currentUser;
                if (user == null) return;

                final newCat = Category(
                  id: 'placeholder',
                  ownerUid: user.id,
                  courseId: widget.courseId,
                  tag: tagController.text,
                  weightPct: double.tryParse(weightController.text) ?? 0.0,
                );

                await svc.createCategory(newCat);
                if (context.mounted) Navigator.pop(ctx);
                _loadData();
              } catch (e) {
                debugPrint(e.toString());
              }
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  Future<void> _showAddItemDialog(BuildContext context) async {
    final labelController = TextEditingController();
    final scoreController = TextEditingController();
    final totalController = TextEditingController(text: '100');
    Category selectedCat = _categories.first;

    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Add Grade Item'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButton<Category>(
                  value: selectedCat,
                  isExpanded: true,
                  items: _categories
                      .map(
                        (c) => DropdownMenuItem(value: c, child: Text(c.tag)),
                      )
                      .toList(),
                  onChanged: (v) {
                    if (v != null) setState(() => selectedCat = v);
                  },
                ),
                TextField(
                  controller: labelController,
                  decoration: const InputDecoration(
                    labelText: 'Item Name (e.g. Quiz 1)',
                  ),
                ),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: scoreController,
                        decoration: const InputDecoration(labelText: 'Score'),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: totalController,
                        decoration: const InputDecoration(labelText: 'Max'),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () async {
                if (labelController.text.isEmpty) return;
                try {
                  final svc = SupabaseService();
                  final user = svc.currentUser;
                  if (user == null) return;

                  final newItem = Item(
                    id: 'placeholder',
                    ownerUid: user.id,
                    courseId: widget.courseId,
                    categoryId: selectedCat.id,
                    label: labelController.text,
                    ptsGot: double.tryParse(scoreController.text) ?? 0.0,
                    ptsMax: double.tryParse(totalController.text) ?? 100.0,
                  );

                  await svc.createItem(newItem);
                  if (context.mounted) Navigator.pop(ctx);
                  _loadData();
                } catch (e) {
                  debugPrint(e.toString());
                }
              },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }
}
