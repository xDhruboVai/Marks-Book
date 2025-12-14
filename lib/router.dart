import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:unimarks/features/auth/login_screen.dart';
import 'package:unimarks/features/auth/signup_screen.dart';
import 'package:unimarks/features/course/course_screen.dart';
import 'package:unimarks/features/dashboard/dashboard_screen.dart';
import 'package:unimarks/features/semester/semester_screen.dart';

part 'router.g.dart';

@riverpod
GoRouter router(Ref ref) {
  final authStream = Supabase.instance.client.auth.onAuthStateChange;

  return GoRouter(
    initialLocation: '/',
    refreshListenable: GoRouterRefreshStream(authStream),
    redirect: (context, state) {
      final session = Supabase.instance.client.auth.currentSession;
      final loggingIn =
          state.uri.path == '/login' || state.uri.path == '/signup';

      if (session == null && !loggingIn) {
        return '/login';
      }
      if (session != null && loggingIn) {
        return '/';
      }
      return null;
    },
    routes: [
      GoRoute(path: '/', builder: (context, state) => const DashboardScreen()),
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(
        path: '/signup',
        builder: (context, state) => const SignupScreen(),
      ),
      GoRoute(
        path: '/course/:id',
        builder: (context, state) {
          final id = state.pathParameters['id']!;
          return CourseScreen(courseId: id);
        },
      ),
      GoRoute(
        path: '/semester/:id',
        builder: (context, state) {
          final id = state.pathParameters['id']!;
          return SemesterScreen(semesterId: id);
        },
      ),
    ],
  );
}

class GoRouterRefreshStream extends ChangeNotifier {
  GoRouterRefreshStream(Stream<dynamic> stream) {
    notifyListeners();
    _subscription = stream.listen((dynamic _) => notifyListeners());
  }

  late final dynamic _subscription;

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }
}
