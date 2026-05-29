import 'dart:async';
import 'dart:math';
import 'dart:typed_data';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:geolocator/geolocator.dart';

// Global reference for native notifications
final FlutterLocalNotificationsPlugin flutterLocalNotificationsPlugin =
    FlutterLocalNotificationsPlugin();

/// Top-Level Service Worker Background Message Handler
/// Runs in a dedicated background isolate even when app is suspended or killed
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Ensure Firebase is initialized inside the background isolate context
  await Firebase.initializeApp();

  print("[LAPANG Background SDK] Sinyal FCM Diterima: ${message.messageId}");
  
  final Map<String, dynamic> data = message.data;
  
  // Extract coordinate parameters from Next.js Dashboard payload
  if (data.containsKey('latitude_tkp') &&
      data.containsKey('longitude_tkp') &&
      data.containsKey('radius_km')) {
      
    final double? latTkp = double.tryParse(data['latitude_tkp'] ?? '');
    final double? lonTkp = double.tryParse(data['longitude_tkp'] ?? '');
    final double? radiusKm = double.tryParse(data['radius_km'] ?? '');

    if (latTkp == null || lonTkp == null || radiusKm == null) {
      print("[WARN] Payload TKP tidak lengkap atau salah tipe data.");
      return;
    }

    try {
      // 1. Ambil koordinat GPS live perangkat warga di latar belakang
      final Position currentPos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 8),
      );

      // 2. Hitung jarak riil perangkat ke TKP menggunakan Haversine Formula
      final double distance = calculateHaversineDistance(
        currentPos.latitude,
        currentPos.longitude,
        latTkp,
        lonTkp,
      );

      print("[GEOPROXIMITY] Jarak ke TKP: ${distance.toStringAsFixed(3)} KM. Batas Radius: $radiusKm KM.");

      // 3. Filter Geofencing: Hanya picu sirine/layar jika berada di radius bahaya
      if (distance <= radiusKm) {
        print("[CRITICAL] PERANGKAT DALAM RADIUS BAHAYA! Memicu visualisasi intervensi darurat...");
        await triggerEmergencyBroadcaster(message);
      } else {
        print("[GEOPROXIMITY] Perangkat aman (di luar radius). Mengabaikan sinyal secara senyap.");
      }
    } catch (err) {
      print("[ERROR] Gagal mengeksekusi triangulasi lokasi background: $err");
      // Fallback: Selalu picu peringatan demi keselamatan jika GPS bermasalah
      await triggerEmergencyBroadcaster(message);
    }
  } else {
    print("[WARN] FCM payload tidak mengandung data geofencing TKP.");
  }
}

/// Haversine Formula: Menghitung jarak lingkaran besar antara dua koordinat bola
double calculateHaversineDistance(
    double lat1, double lon1, double lat2, double lon2) {
  const double earthRadiusKm = 6371.0; // Radius rata-rata bumi

  final double dLat = _toRadians(lat2 - lat1);
  final double dLon = _toRadians(lon2 - lon1);

  final double a = sin(dLat / 2) * sin(dLat / 2) +
      cos(_toRadians(lat1)) *
          cos(_toRadians(lat2)) *
          sin(dLon / 2) *
          sin(dLon / 2);

  final double c = 2 * asin(sqrt(a));
  return earthRadiusKm * c;
}

double _toRadians(double degree) {
  return degree * pi / 180.0;
}

/// Memicu notifikasi prioritas tertinggi untuk bypass lockscreen dan putar sirene
Future<void> triggerEmergencyBroadcaster(RemoteMessage message) async {
  final Map<String, dynamic> data = message.data;
  final String victimName = data['victim_name'] ?? 'ANONIM';
  final String victimAge = data['victim_age'] ?? 'Balita';
  final String incidentLocation = data['incident_location'] ?? 'Lokasi Terdekat';

  // Android specific details for heads-up, lockscreen takeover, and siren playing
  final AndroidNotificationDetails androidDetails = AndroidNotificationDetails(
    'lapang_emergency_channel', // Channel ID
    'Siaran Siaga Darurat LAPANG', // Channel Name
    channelDescription: 'Pemberitahuan darurat penculikan anak berkecepatan tinggi',
    importance: Importance.max,
    priority: Priority.high,
    
    // Bypass lockscreen with custom layout
    fullScreenIntent: true,
    
    // Play custom alert sound siren.mp3 (placed in android/app/src/main/res/raw/siren.mp3)
    sound: const RawResourceAndroidNotificationSound('siren'),
    playSound: true,
    
    // Extreme vibration pattern to alert user
    vibrationPattern: Int64List.fromList([0, 1000, 500, 1000, 500, 1000, 500, 1500]),
    enableVibration: true,
    
    category: AndroidNotificationCategory.alarm,
    visibility: NotificationVisibility.public,
  );

  final NotificationDetails notificationDetails = NotificationDetails(
    android: androidDetails,
  );

  await flutterLocalNotificationsPlugin.show(
    1001, // Unique notification ID
    'SIAGA 1: PENCULIKAN ANAK!',
    'PENCULIKAN BARU: $victimName ($victimAge th) dekat $incidentLocation. Bantu pencarian secepatnya!',
    notificationDetails,
    payload: data['token'],
  );
}
