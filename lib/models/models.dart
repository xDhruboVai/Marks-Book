// Models for UniMarks

class Semester {
  final String id;
  final String ownerUid;
  final String tag;
  final DateTime start;
  final DateTime end;

  Semester({
    required this.id,
    required this.ownerUid,
    required this.tag,
    required this.start,
    required this.end,
  });

  factory Semester.fromMap(Map<String, dynamic> map) {
    return Semester(
      id: map['sem_xid'] as String,
      ownerUid: map['owner_uid'] as String,
      tag: map['sem_tag'] as String,
      start: DateTime.parse(map['sem_start'] as String),
      end: DateTime.parse(map['sem_end'] as String),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'sem_xid': id,
      'owner_uid': ownerUid,
      'sem_tag': tag,
      'sem_start': start.toIso8601String(),
      'sem_end': end.toIso8601String(),
    };
  }
}

class Course {
  final String id;
  final String ownerUid;
  final String semesterId;
  final String code;
  final String title;
  final int units;
  final bool hasLab;
  final double labWeightPct;
  final double targetPct;

  Course({
    required this.id,
    required this.ownerUid,
    required this.semesterId,
    required this.code,
    required this.title,
    this.units = 3,
    this.hasLab = false,
    this.labWeightPct = 0.0,
    this.targetPct = 85.0,
  });

  factory Course.fromMap(Map<String, dynamic> map) {
    return Course(
      id: map['crs_xid'],
      ownerUid: map['owner_uid'],
      semesterId: map['sem_xid'],
      code: map['crs_code'],
      title: map['crs_title'],
      units: map['crs_units'] ?? 3,
      hasLab: map['has_lab'] ?? false,
      labWeightPct: (map['lab_weight_pct'] as num?)?.toDouble() ?? 0.0,
      targetPct: (map['target_pct'] as num?)?.toDouble() ?? 85.0,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'crs_xid': id,
      'owner_uid': ownerUid,
      'sem_xid': semesterId,
      'crs_code': code,
      'crs_title': title,
      'crs_units': units,
      'has_lab': hasLab,
      'lab_weight_pct': labWeightPct,
      'target_pct': targetPct,
    };
  }
}

class Category {
  final String id;
  final String ownerUid;
  final String courseId;
  final String tag;
  final double weightPct;
  final int? bestOfK;
  final int? totalN;
  final String dropRule; // 'best_k' | 'avg_all'
  final bool isInLab;

  Category({
    required this.id,
    required this.ownerUid,
    required this.courseId,
    required this.tag,
    required this.weightPct,
    this.bestOfK,
    this.totalN,
    this.dropRule = 'avg_all',
    this.isInLab = false,
  });

  factory Category.fromMap(Map<String, dynamic> map) {
    return Category(
      id: map['cat_xid'],
      ownerUid: map['owner_uid'],
      courseId: map['crs_xid'],
      tag: map['cat_tag'],
      weightPct: (map['cat_weight_pct'] as num).toDouble(),
      bestOfK: map['best_of_k'],
      totalN: map['total_n'],
      dropRule: map['drop_rule'] ?? 'avg_all',
      isInLab: map['is_in_lab'] ?? false,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'cat_xid': id,
      'owner_uid': ownerUid,
      'crs_xid': courseId,
      'cat_tag': tag,
      'cat_weight_pct': weightPct,
      'best_of_k': bestOfK,
      'total_n': totalN,
      'drop_rule': dropRule,
      'is_in_lab': isInLab,
    };
  }
}

class Item {
  final String id;
  final String ownerUid;
  final String courseId;
  final String categoryId;
  final String label;
  final double ptsGot;
  final double ptsMax;
  final DateTime? dueOn;
  final bool isCounted;

  Item({
    required this.id,
    required this.ownerUid,
    required this.courseId,
    required this.categoryId,
    required this.label,
    this.ptsGot = 0,
    this.ptsMax = 100,
    this.dueOn,
    this.isCounted = true,
  });

  double get percentage => (ptsMax > 0) ? (ptsGot / ptsMax) * 100 : 0.0;

  factory Item.fromMap(Map<String, dynamic> map) {
    return Item(
      id: map['itm_xid'],
      ownerUid: map['owner_uid'],
      courseId: map['crs_xid'],
      categoryId: map['cat_xid'],
      label: map['itm_label'],
      ptsGot: (map['pts_got'] as num).toDouble(),
      ptsMax: (map['pts_max'] as num).toDouble(),
      dueOn: map['due_on'] != null ? DateTime.parse(map['due_on']) : null,
      isCounted: map['is_counted'] ?? true,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'itm_xid': id,
      'owner_uid': ownerUid,
      'crs_xid': courseId,
      'cat_xid': categoryId,
      'itm_label': label,
      'pts_got': ptsGot,
      'pts_max': ptsMax,
      'due_on': dueOn?.toIso8601String(),
      'is_counted': isCounted,
    };
  }
}
