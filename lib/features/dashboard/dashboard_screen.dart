import 'package:flutter/material.dart';
import 'package:unimarks/models/models.dart';
import 'package:unimarks/services/supabase_service.dart';
import 'package:go_router/go_router.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  late Future<List<Semester>> _semestersFuture;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  void _refresh() {
    setState(() {
      _semestersFuture = SupabaseService().getSemesters();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () => _showAddSemesterDialog(context),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => SupabaseService().signOut(),
          ),
        ],
      ),

      body: FutureBuilder<List<Semester>>(
        future: _semestersFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          }

          final semesters = snapshot.data ?? [];

          if (semesters.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.school, size: 64, color: Colors.grey),
                  const SizedBox(height: 16),
                  const Text('No semesters yet.'),
                  TextButton(
                    onPressed: () => _showAddSemesterDialog(context),
                    child: const Text('Create your first semester'),
                  ),
                ],
              ),
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: semesters.length,
            itemBuilder: (context, index) {
              final sem = semesters[index];
              return Card(
                clipBehavior: Clip.antiAlias,
                child: ListTile(
                  title: Text(sem.tag),
                  subtitle: Text(
                    '${_formatDate(sem.start)} - ${_formatDate(sem.end)}',
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    context.push('/semester/${sem.id}');
                  },
                ),
              );
            },
          );
        },
      ),
    );
  }

  String _formatDate(DateTime dt) {
    return '${dt.year}-${dt.month.toString().padLeft(2, '0')}';
  }

  Future<void> _showAddSemesterDialog(BuildContext context) async {
    final tagController = TextEditingController();
    // Defaults hidden from user
    final start = DateTime.now();
    final end = DateTime.now().add(const Duration(days: 90)); // Approx 3 months

    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add Semester'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: tagController,
              decoration: const InputDecoration(
                labelText: 'Semester Tag (e.g. Fall 2024)',
              ),
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

                final newSem = Semester(
                  id: 'placeholder',
                  ownerUid: user.id,
                  tag: tagController.text,
                  start: start,
                  end: end,
                );

                await svc.createSemester(newSem);
                if (context.mounted) Navigator.pop(ctx);
                _refresh();
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
