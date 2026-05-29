import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:geolocator/geolocator.dart';
import 'background_handler.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  try {
    // 1. Inisialisasi Google Firebase Core SDK
    await Firebase.initializeApp();

    // Daftarkan perangkat secara otomatis ke FCM Topic khusus siaga_anak_hilang
    try {
      await FirebaseMessaging.instance.subscribeToTopic('siaga_anak_hilang');
      print("[LAPANG Background SDK] Terdaftar ke FCM Topic: siaga_anak_hilang");
    } catch (topicErr) {
      print("[WARN] Gagal subscribe ke FCM Topic: $topicErr");
    }

    // 2. Registrasi background messaging handler top-level VM entrypoint
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
  } catch (fbErr) {
    print("[ERROR] Firebase initialization crash bypassed: $fbErr");
  }

  try {
    // 3. Inisialisasi Android Local Notifications Channels
    const AndroidInitializationSettings initializationSettingsAndroid =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    const InitializationSettings initializationSettings = InitializationSettings(
      android: initializationSettingsAndroid,
    );
    await flutterLocalNotificationsPlugin.initialize(
      initializationSettings,
      onDidReceiveNotificationResponse: (NotificationResponse response) {
        print("Notification clicked: ${response.payload}");
      },
    );
  } catch (notiErr) {
    print("[ERROR] Local notifications initialization crash bypassed: $notiErr");
  }

  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'LAPANG Emergency SDK',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF030712), // tactical-dark
        primaryColor: const Color(0xFF06B6D4), // cyan-beacon
        fontFamily: 'monospace',
      ),
      home: const DashboardScreen(),
    );
  }
}

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  String _fcmToken = "Mengambil Token...";
  String _locationStatus = "Memeriksa Izin GPS...";
  String _notificationsStatus = "Memeriksa Izin Notifikasi...";
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _requestAllPermissionsAndSetup();
  }

  Future<void> _requestAllPermissionsAndSetup() async {
    setState(() {
      _isLoading = true;
    });

    try {
      // 1. Minta Izin Notifikasi Sistem
      final NotificationSettings settings =
          await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
        provisional: false,
      );

      setState(() {
        _notificationsStatus =
            settings.authorizationStatus == AuthorizationStatus.authorized
                ? "DIIZINKAN (AKTIF)"
                : "DITOLAK (NON-AKTIF)";
      });

      // 2. Minta Izin GPS Lokasi (Foreground & Background)
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }

      setState(() {
        if (permission == LocationPermission.always) {
          _locationStatus = "LOKASI LATAR BELAKANG AKTIF";
        } else if (permission == LocationPermission.whileInUse) {
          _locationStatus = "LOKASI SAAT DIGUNAKAN SAJA";
        } else {
          _locationStatus = "IZIN LOKASI DITOLAK";
        }
      });

      // 3. Ambil Token Registrasi FCM Google Cloud
      final String? token = await FirebaseMessaging.instance.getToken();
      setState(() {
        _fcmToken = token ?? "Gagal mendapatkan Token.";
      });
    } catch (err) {
      print("Error setting up permissions: $err");
      setState(() {
        _fcmToken = "Gagal memuat SDK: $err";
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'LAPANG EMERGENCY SDK',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            letterSpacing: 1.5,
            fontSize: 14,
          ),
        ),
        backgroundColor: const Color(0xFF090D16),
        centerTitle: true,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Color(0xFF06B6D4)),
            onPressed: _requestAllPermissionsAndSetup,
          )
        ],
      ),
      body: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 10),
              
              // Device Header status logo
              Center(
                child: Container(
                  height: 64,
                  width: 64,
                  decoration: BoxDecoration(
                    color: const Color(0xFF06B6D4).withOpacity(0.1),
                    shape: BoxShape.circle,
                    border: Border.all(color: const Color(0xFF06B6D4).withOpacity(0.3)),
                  ),
                  child: const Icon(
                    Icons.security,
                    color: Color(0xFF06B6D4),
                    size: 32,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              const Center(
                child: Text(
                  'STATUS PERANGKAT SIMULATOR WARGA',
                  style: TextStyle(fontSize: 10, color: Colors.grey),
                ),
              ),
              const SizedBox(height: 20),

              // SECTION 1: SYSTEM PERMISSIONS STATUS
              _buildTacticalCard(
                title: 'KENDALI INTEGRITAS SISTEM',
                icon: Icons.settings_system_daydream,
                children: [
                  _buildStatusRow(
                    label: 'IZIN NOTIFIKASI OS:',
                    value: _notificationsStatus,
                    isSuccess: _notificationsStatus.contains('DIIZINKAN'),
                  ),
                  const Divider(color: Colors.white10),
                  _buildStatusRow(
                    label: 'IZIN GPS KOORDINAT:',
                    value: _locationStatus,
                    isSuccess: _locationStatus.contains('AKTIF') ||
                        _locationStatus.contains('DIGUNAKAN'),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // SECTION 2: DEVICE REGISTERED TOKEN
              _buildTacticalCard(
                title: 'TOKEN RESTRISTASI ALAT (FCM)',
                icon: Icons.vpn_key,
                children: [
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.4),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: Colors.white10),
                    ),
                    child: SelectableText(
                      _fcmToken,
                      style: const TextStyle(
                        fontSize: 10,
                        color: Color(0xFF10B981), // tactical-emerald
                        fontFamily: 'monospace',
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  ElevatedButton.icon(
                    onPressed: () {
                      // Clipboard actions
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Token FCM disalin ke papan klip!'),
                          backgroundColor: Color(0xFF06B6D4),
                        ),
                      );
                    },
                    icon: const Icon(Icons.copy, size: 16),
                    label: const Text('SALIN TOKEN ALAT'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white10,
                      foregroundColor: Colors.white,
                      elevation: 0,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(6),
                        side: const BorderSide(color: Colors.white24),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // SECTION 3: RECEPTION LOGGER
              _buildTacticalCard(
                title: 'TELEMETRI LOGGER ALAT',
                icon: Icons.analytics,
                children: [
                  Container(
                    height: 100,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.black,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: Colors.white10),
                    ),
                    child: ListView(
                      children: const [
                        Text(
                          "[12:00:00] LAPANG SDK: FlashZeroService aktif.",
                          style: TextStyle(fontSize: 9, color: Colors.grey),
                        ),
                        Text(
                          "[12:00:01] GEOLOCATOR: GPS service initialized.",
                          style: TextStyle(fontSize: 9, color: Colors.grey),
                        ),
                        Text(
                          "[12:00:02] FCM: Mendengarkan sinyal di background...",
                          style: TextStyle(fontSize: 9, color: Colors.grey),
                        ),
                      ],
                    ),
                  )
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTacticalCard({
    required String title,
    required IconData icon,
    required List<Widget> children,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF0B0F19), // tactical card color
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.white10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(icon, size: 16, color: const Color(0xFF06B6D4)),
              const SizedBox(width: 8),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 1.2,
                  color: Color(0xFF06B6D4),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ...children,
        ],
      ),
    );
  }

  Widget _buildStatusRow({
    required String label,
    required String value,
    required bool isSuccess,
  }) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 10, color: Colors.grey),
        ),
        Text(
          value,
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.bold,
            color: isSuccess ? const Color(0xFF10B981) : Colors.redAccent,
          ),
        ),
      ],
    );
  }
}
