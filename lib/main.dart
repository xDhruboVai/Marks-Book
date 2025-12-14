import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:unimarks/router.dart';
import 'package:unimarks/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  try {
    // Load Env
    await dotenv.load(fileName: ".env");

    // Initialize Supabase
    await Supabase.initialize(
      url: dotenv.env['SUPABASE_URL'] ?? '',
      anonKey: dotenv.env['SUPABASE_ANON_KEY'] ?? '',
    );

    runApp(const ProviderScope(child: UniMarksApp()));
  } catch (e, stack) {
    debugPrint('Initialization Error: $e\n$stack');
    runApp(
      MaterialApp(
        home: Scaffold(
          body: Center(child: SelectableText('Initialization Error:\n$e')),
        ),
      ),
    );
  }
}

class UniMarksApp extends ConsumerWidget {
  const UniMarksApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      title: 'UniMarks',
      theme: AppTheme.darkTheme, // Force Dark Mode
      themeMode: ThemeMode.dark,
      routerConfig: router,
      debugShowCheckedModeBanner: false,
    );
  }
}
