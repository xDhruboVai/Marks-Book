import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:unimarks/models/models.dart';

class SupabaseService {
  static final SupabaseClient _client = Supabase.instance.client;

  // Auth Methods
  Future<AuthResponse> signUp(String email, String password) async {
    return await _client.auth.signUp(email: email, password: password);
  }

  Future<AuthResponse> signIn(String email, String password) async {
    return await _client.auth.signInWithPassword(
      email: email,
      password: password,
    );
  }

  Future<void> signOut() async {
    await _client.auth.signOut();
  }

  User? get currentUser => _client.auth.currentUser;

  Stream<AuthState> get authStateChanges => _client.auth.onAuthStateChange;

  // Database Methods: Semesters
  Future<List<Semester>> getSemesters() async {
    final response = await _client
        .from('semesters')
        .select()
        .eq('owner_uid', currentUser!.id)
        .order('sem_start', ascending: false);
    return (response as List).map((e) => Semester.fromMap(e)).toList();
  }

  Future<void> createSemester(Semester semester) async {
    await _client.from('semesters').insert(semester.toMap()..remove('sem_xid'));
    // remove xid to let DB generate it, or if we generate locally, keep it.
    // Schema says default uuid_generate_v4(), but if we pass it, it uses it.
    // Model has `id` required. If creating new, we might generate ID locally or pass null in map if ID is placeholder.
    // Better: let DB generate. But implementation detail: we might want optimistic UI.
    // For now, removing ID if it's a placeholder or handling logic in Repository.
    // The strict model requires ID. I'll assume we generate UUIDs on client or handle 'null' ID gracefully if separate model for creation.
    // For MVP, letting DB handle it is safer for consistency, but requires fetching back.
    // Alternatively, generate UUID locally (uuid package added).
  }

  // Database Methods: Courses
  Future<List<Course>> getCourses(String semesterId) async {
    final response = await _client
        .from('courses')
        .select()
        .eq('sem_xid', semesterId)
        .eq('owner_uid', currentUser!.id);
    return (response as List).map((e) => Course.fromMap(e)).toList();
  }

  Future<void> createCourse(Course course) async {
    await _client.from('courses').insert(course.toMap()..remove('crs_xid'));
  }

  // Database Methods: Categories
  Future<List<Category>> getCategories(String courseId) async {
    final response = await _client
        .from('categories')
        .select()
        .eq('crs_xid', courseId)
        .eq('owner_uid', currentUser!.id);
    return (response as List).map((e) => Category.fromMap(e)).toList();
  }

  Future<void> createCategory(Category category) async {
    await _client
        .from('categories')
        .insert(category.toMap()..remove('cat_xid'));
  }

  // Database Methods: Items
  Future<List<Item>> getItems(String courseId) async {
    final response = await _client
        .from('items')
        .select()
        .eq('crs_xid', courseId)
        .eq('owner_uid', currentUser!.id);
    return (response as List).map((e) => Item.fromMap(e)).toList();
  }

  Future<void> createItem(Item item) async {
    await _client.from('items').insert(item.toMap()..remove('itm_xid'));
  }

  // CRUD operations would continue similarly...
}
