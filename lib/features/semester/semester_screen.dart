import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:unimarks/models/models.dart';
import 'package:unimarks/services/supabase_service.dart';

class SemesterScreen extends StatefulWidget {
  final String semesterId;
  const SemesterScreen({super.key, required this.semesterId});

  @override
  State<SemesterScreen> createState() => _SemesterScreenState();
}

class _SemesterScreenState extends State<SemesterScreen> {
  // We need to fetch the semester details (for title) and courses
  Semester? _semester;
  List<Course> _courses = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    final svc = SupabaseService();
    try {
      // Fetch specific semester (inefficient if not in svc, doing manual list find or fetch)
      // Since we don't have getSemesterById, we'll fetch all and find locally for MVP, or better, implement it.
      // Implementing getSemesterById is cleaner, but to save context switching I'll filter.
      // Wait, I can just select single.
      // Or easier: pass the Semester object? GoRouter passing objects is tricky.

      // Fetch semester details
      final semList = await svc.getSemesters();
      _semester = semList.firstWhere(
        (s) => s.id == widget.semesterId,
        orElse: () => throw Exception('Not found'),
      );

      // Fetch courses
      _courses = await svc.getCourses(widget.semesterId);
    } catch (e) {
      debugPrint('Error loading semester: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading)
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    if (_semester == null)
      return const Scaffold(body: Center(child: Text('Semester not found')));

    return Scaffold(
      appBar: AppBar(title: Text(_semester!.tag)),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showAddCourseDialog(context),
        child: const Icon(Icons.add),
      ),
      body: _courses.isEmpty
          ? Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Text('No courses yet.'),
                  TextButton(
                    onPressed: () => _showAddCourseDialog(context),
                    child: const Text('Add your first course'),
                  ),
                ],
              ),
            )
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _courses.length,
              itemBuilder: (context, index) {
                final course = _courses[index];
                return Card(
                  child: ListTile(
                    title: Text(course.title),
                    subtitle: Text(course.code),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () {
                      context.push('/course/${course.id}');
                    },
                  ),
                );
              },
            ),
    );
  }

  Future<void> _showAddCourseDialog(BuildContext context) async {
    final codeController = TextEditingController();
    final titleController = TextEditingController();
    final unitsController = TextEditingController(text: '3');
    final targetController = TextEditingController(text: '85');

    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add Course'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: codeController,
                decoration: const InputDecoration(
                  labelText: 'Course Code (e.g. CS101)',
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: titleController,
                decoration: const InputDecoration(
                  labelText: 'Course Title (e.g. Intro to CS)',
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: unitsController,
                      decoration: const InputDecoration(labelText: 'Units'),
                      keyboardType: TextInputType.number,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(
                      controller: targetController,
                      decoration: const InputDecoration(labelText: 'Target %'),
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
              if (codeController.text.isEmpty || titleController.text.isEmpty)
                return;

              try {
                final svc = SupabaseService();
                final user = svc.currentUser;
                if (user == null) return;

                final newCourse = Course(
                  id: 'placeholder',
                  ownerUid: user.id,
                  semesterId: widget.semesterId,
                  code: codeController.text,
                  title: titleController.text,
                  units: int.tryParse(unitsController.text) ?? 3,
                  targetPct: double.tryParse(targetController.text) ?? 85.0,
                );

                await svc.createCourse(newCourse);
                if (context.mounted) Navigator.pop(ctx);
                _loadData(); // Refresh list
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(
                    context,
                  ).showSnackBar(SnackBar(content: Text('Error: $e')));
                }
              }
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }
}
