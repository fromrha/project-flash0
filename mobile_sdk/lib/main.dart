import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:geolocator/geolocator.dart';
import 'package:geocoding/geocoding.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:url_launcher/url_launcher.dart';
import 'background_handler.dart';

final StreamController<String?> selectNotificationStream = StreamController<String?>.broadcast();

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
        if (response.payload != null) {
          selectNotificationStream.add(response.payload);
        }
      },
    );

    // Buat channel notifikasi khusus dengan prioritas tinggi dan suara sirine
    const AndroidNotificationChannel channel = AndroidNotificationChannel(
      'lapang_emergency_channel_v4', // id
      'Siaran Siaga Darurat LAPANG', // name
      description: 'Pemberitahuan darurat penculikan anak berkecepatan tinggi',
      importance: Importance.max,
      playSound: true,
      sound: RawResourceAndroidNotificationSound('siren'),
      enableVibration: true,
      audioAttributesUsage: AudioAttributesUsage.alarm,
    );

    await flutterLocalNotificationsPlugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(channel);

    // Register silent channel to avoid overlapping audio
    const AndroidNotificationChannel silentChannel = AndroidNotificationChannel(
      'lapang_emergency_channel_silent', // id
      'Siaran Siaga Darurat LAPANG (Hening)', // name
      description: 'Pemberitahuan darurat penculikan anak tanpa suara',
      importance: Importance.max,
      playSound: false,
      enableVibration: true,
    );

    await flutterLocalNotificationsPlugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(silentChannel);

  } catch (notiErr) {
    print("[ERROR] Local notifications / foreground listener initialization failed: $notiErr");
  }

  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'LAPANG',
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
  String _notificationsStatus = "Memeriksa Izin Notifikasi...";
  Map<String, dynamic>? _incomingAlertData;
  List<String> _telemetryLogs = [];
  bool _showReportForm = false;
  final TextEditingController _reportController = TextEditingController();

  String _activeTab = "home";
  String _currentTimeString = "00:00:00";
  Position? _currentPosition;
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  Timer? _clockTimer;
  String? _lastProcessedTokenId;
  String _reverseGeocodedAddress = "Mencari lokasi...";
  Color _locationBadgeColor = const Color(0xFF94A3B8);

  @override
  void initState() {
    super.initState();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: Colors.transparent,
    ));
    _telemetryLogs = [
      "[${DateTime.now().toIso8601String().substring(11, 19)}] LAPANG SDK: FlashZeroService aktif.",
      "[${DateTime.now().toIso8601String().substring(11, 19)}] GEOLOCATOR: GPS service initialized.",
      "[${DateTime.now().toIso8601String().substring(11, 19)}] FCM: Mendengarkan sinyal..."
    ];
    _requestAllPermissionsAndSetup();
    _setupFcmUiListeners();
    _setupLocalNotificationListeners();
    _setupNativeOverlayChannel();

    // Start periodic timer for clock in drawer
    _clockTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) {
        final now = DateTime.now();
        setState(() {
          _currentTimeString = "${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}:${now.second.toString().padLeft(2, '0')}";
        });
      }
    });
  }

  @override
  void dispose() {
    _reportController.dispose();
    _clockTimer?.cancel();
    super.dispose();
  }

  void _addLog(String msg) {
    final String timestamp = DateTime.now().toIso8601String().substring(11, 19);
    setState(() {
      _telemetryLogs.insert(0, "[$timestamp] $msg");
    });
  }

  void _setIncomingAlert(Map<String, dynamic>? data) {
    setState(() {
      _incomingAlertData = data;
      _showReportForm = false;
    });
    if (data != null) {
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
      const MethodChannel('com.lapang.emergency.sdk/overlay').invokeMethod('startSiren');
    } else {
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
      SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
      ));
    }
  }



  String get _latLngText {
    if (_currentPosition == null) return "LAT: -7.3683, LON: 109.9764";
    return "LAT: ${_currentPosition!.latitude.toStringAsFixed(4)}, LON: ${_currentPosition!.longitude.toStringAsFixed(4)}";
  }

  void _setupNativeOverlayChannel() {
    const MethodChannel overlayChannel = MethodChannel('com.lapang.emergency.sdk/overlay');
    overlayChannel.setMethodCallHandler((MethodCall call) async {
      if (call.method == "onAlertReceived") {
        final String? alertJson = call.arguments as String?;
        if (alertJson != null) {
          _addLog("FCM Native Broadcast Diterima");
          _handleLocalNotificationPayload(alertJson);
        }
      }
    });

    overlayChannel.invokeMethod<String?>('getPendingAlert').then((String? alertJson) {
      if (alertJson != null) {
        _addLog("FCM Native Launch Diterima");
        _handleLocalNotificationPayload(alertJson);
      }
    });
  }

  void _setupLocalNotificationListeners() {
    // Listen to local notification clicks when app is in foreground/background
    selectNotificationStream.stream.listen((String? payload) {
      if (payload != null) {
        _addLog("Local Notification Klik Diterima");
        _handleLocalNotificationPayload(payload);
      }
    });

    // Check if app was launched by a local notification (e.g. from background/killed state)
    flutterLocalNotificationsPlugin.getNotificationAppLaunchDetails().then((details) {
      if (details?.didNotificationLaunchApp ?? false) {
        final payload = details?.notificationResponse?.payload;
        if (payload != null) {
          _addLog("Local Notification Launch Diterima");
          _handleLocalNotificationPayload(payload);
        }
      }
    });
  }

  void _handleLocalNotificationPayload(String payload) {
    try {
      final Map<String, dynamic> data = jsonDecode(payload);
      _handleIncomingAlert(data);
    } catch (e) {
      _addLog("Gagal parsing payload notifikasi: $e");
    }
  }

  void _setupFcmUiListeners() {
    // 1. Listen for foreground FCM messages
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      _addLog("FCM Foreground Diterima: ${message.messageId}");
      _handleIncomingAlert(message.data);
    });

    // 2. Listen for when user clicks notification and app opens from background
    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      _addLog("FCM Notification di-klik: ${message.messageId}");
      _handleIncomingAlert(message.data);
    });

    // 3. Check if the app was launched by a push alert initially
    FirebaseMessaging.instance.getInitialMessage().then((RemoteMessage? message) {
      if (message != null) {
        _addLog("FCM Initial Launch Payload Diterima: ${message.messageId}");
        _handleIncomingAlert(message.data);
      }
    });
  }

  Future<void> _handleIncomingAlert(Map<String, dynamic> data) async {
    final String victimName = data['victim_name'] ?? '';
    final String tokenId = data['secure_token_id'] ?? '';
    
    if (victimName.isEmpty && tokenId.isEmpty) {
      return; // Ignore empty/corrupted payloads
    }

    final String uniqueId = tokenId.isNotEmpty ? tokenId : victimName;

    // Persisted local cache duplication barrier
    if (await isCaseAlreadyProcessed(uniqueId)) {
      _addLog("Abaikan Replay Kasus (Ghost Notification): $uniqueId");
      return;
    }
    await markCaseAsProcessed(uniqueId);

    _lastProcessedTokenId = uniqueId;

    _setIncomingAlert(data);
    _addLog("SIAGA 1 PENCULIKAN: ${data['victim_name']} (${data['victim_age']}th)");
  }

  Future<void> _requestAllPermissionsAndSetup() async {
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

      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
        setState(() {
          _reverseGeocodedAddress = "Ijinkan Akses Lokasi";
          _locationBadgeColor = const Color(0xFFEF4444);
        });
      } else {
        // Fetch location coordinates
        Position? pos;
        try {
          pos = await Geolocator.getCurrentPosition(
            desiredAccuracy: LocationAccuracy.high,
            timeLimit: const Duration(seconds: 5),
          );
        } catch (e) {
          print("Geolocator location retrieval failed: $e");
        }
        setState(() {
          _currentPosition = pos;
        });

        if (pos != null) {
          await _performReverseGeocoding(pos.latitude, pos.longitude);
        } else {
          setState(() {
            _reverseGeocodedAddress = "Lokasi tidak ditemukan";
            _locationBadgeColor = const Color(0xFF64748B);
          });
        }
      }

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
    }
  }

  Future<void> _performReverseGeocoding(double latitude, double longitude) async {
    try {
      final List<Placemark> placemarks = await placemarkFromCoordinates(latitude, longitude);
      if (placemarks.isNotEmpty) {
        final Placemark place = placemarks.first;
        
        String street = place.thoroughfare ?? '';
        if (street.isEmpty) {
          street = place.name ?? '';
        }
        if (street.isNotEmpty && !street.toLowerCase().startsWith('jl.')) {
          street = 'Jl. $street';
        }
        
        final String kecamatan = place.subLocality ?? place.locality ?? '';
        
        String formatted = '';
        if (street.isNotEmpty && kecamatan.isNotEmpty) {
          formatted = '$street, $kecamatan';
        } else if (street.isNotEmpty) {
          formatted = street;
        } else if (kecamatan.isNotEmpty) {
          formatted = kecamatan;
        } else {
          formatted = 'Lokasi tidak ditemukan';
        }
        
        setState(() {
          _reverseGeocodedAddress = formatted;
          _locationBadgeColor = const Color(0xFF34D399); // Green
        });
      } else {
        setState(() {
          _reverseGeocodedAddress = 'Lokasi tidak ditemukan';
          _locationBadgeColor = const Color(0xFF64748B); // Dimmed Grey
        });
      }
    } catch (e) {
      print("Reverse geocoding error: $e");
      setState(() {
        _reverseGeocodedAddress = 'Lokasi tidak ditemukan';
        _locationBadgeColor = const Color(0xFF64748B); // Dimmed Grey
      });
    }
  }

  Future<void> _openLink(String urlString) async {
    final Uri url = Uri.parse(urlString);
    try {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    } catch (e) {
      print("Error launching URL: $e");
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: _scaffoldKey,
      drawerEnableOpenDragGesture: !_showReportForm && _incomingAlertData == null,
      drawer: SizedBox(
        width: MediaQuery.of(context).size.width * 0.8,
        child: Drawer(
          backgroundColor: const Color(0xFF0B0F19),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Drawer Header
              Container(
                padding: const EdgeInsets.fromLTRB(16, 54, 16, 20),
                decoration: const BoxDecoration(
                  color: Colors.transparent,
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Opacity(
                      opacity: 0.85,
                      child: SvgPicture.asset(
                        'assets/lapang-logo-white-loc1.svg',
                        height: 22,
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, color: Colors.white70, size: 20),
                      onPressed: () => Navigator.pop(context),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                    ),
                  ],
                ),
              ),

              // Drawer Tabs list
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                  children: [
                    _buildDrawerItem("home", "Beranda", Icons.home_outlined),
                    _buildDrawerItem("telemetry", "Sistem Telemetri", Icons.terminal_outlined),
                    _buildDrawerItem("how-it-works", "Cara Kerja", Icons.help_outline),
                    _buildDrawerItem("license", "Lisensi Kode", Icons.description_outlined),
                    _buildDrawerItem("about", "Tentang", Icons.info_outline),
                  ],
                ),
              ),

              // Drawer Footer
              Container(
                padding: const EdgeInsets.all(16),
                decoration: const BoxDecoration(
                  color: Colors.transparent,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'VERSI APLIKASI:',
                      style: TextStyle(fontSize: 8, color: Color(0xFF64748B), fontFamily: 'monospace'),
                    ),
                    const SizedBox(height: 2),
                    const Text(
                      'v0.3.0',
                      style: TextStyle(fontSize: 10, color: Color(0xFFCBD5E1), fontWeight: FontWeight.bold, fontFamily: 'monospace'),
                    ),
                    const SizedBox(height: 10),
                    const Text(
                      'WAKTU SERVER:',
                      style: TextStyle(fontSize: 8, color: Color(0xFF64748B), fontFamily: 'monospace'),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _currentTimeString,
                      style: const TextStyle(fontSize: 10, color: Color(0xFFCBD5E1), fontWeight: FontWeight.bold, fontFamily: 'monospace'),
                    ),
                    const SizedBox(height: 10),
                    const Text(
                      'KOORDINAT SEKARANG:',
                      style: TextStyle(fontSize: 8, color: Color(0xFF64748B), fontFamily: 'monospace'),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _latLngText,
                      style: const TextStyle(fontSize: 9, color: Color(0xFFCBD5E1), fontWeight: FontWeight.bold, fontFamily: 'monospace'),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      body: Stack(
        children: [
          // Cyber-Grid Background Painter
          Positioned.fill(
            child: CustomPaint(
              painter: CyberGridPainter(),
            ),
          ),

          // Main Dashboard View (shows if no takeover is active)
          if (_incomingAlertData == null)
            SafeArea(
              bottom: false,
              child: Column(
                children: [
                  // 1. Mobile Screen Header (Status Bar Mock)
                  Container(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                    decoration: const BoxDecoration(
                      color: Colors.transparent,
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        GestureDetector(
                          onTap: () => _scaffoldKey.currentState?.openDrawer(),
                          child: const Icon(Icons.menu, color: Color(0xFF94A3B8), size: 24),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: const Color(0xFF10B981).withOpacity(0.1),
                            border: Border.all(
                              color: const Color(0xFF34D399).withOpacity(0.3),
                            ),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              BlinkingDot(),
                              SizedBox(width: 6),
                              Text(
                                'SISTEM AKTIF',
                                style: TextStyle(
                                  fontSize: 8,
                                  fontWeight: FontWeight.bold,
                                  fontFamily: 'monospace',
                                  color: Color(0xFF34D399),
                                  letterSpacing: 1.0,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),

                  // 2. Active Tab Content
                  Expanded(
                    child: _buildActiveTabContent(),
                  ),
                ],
              ),
            ),

          // Fullscreen Emergency Takeover Overlay
          if (_incomingAlertData != null)
            _buildEmergencyOverlay(_incomingAlertData!),
        ],
      ),
    );
  }

  Widget _buildActiveTabContent() {
    if (_activeTab == "home") {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // 1. Top Header Group
          Padding(
            padding: const EdgeInsets.only(top: 24, left: 16, right: 16),
            child: Column(
              children: [
                const Text(
                  'LAPANG',
                  style: TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.bold,
                    fontFamily: 'monospace',
                    color: Colors.white,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 6),
                const Text(
                  'Laporan Anak Hilang',
                  style: TextStyle(
                    fontSize: 12,
                    fontFamily: 'monospace',
                    color: Color(0xFF06B6D4),
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 12),
                
                // Location badge with custom map pin icon and dynamic colors
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: _locationBadgeColor.withOpacity(0.1),
                    border: Border.all(
                      color: _locationBadgeColor.withOpacity(0.3),
                    ),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.location_on,
                        size: 12,
                        color: _locationBadgeColor,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        _reverseGeocodedAddress,
                        style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.bold,
                          fontFamily: 'monospace',
                          color: _locationBadgeColor,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // 2. Centered Logo in remaining space
          const Expanded(
            child: Center(
              child: PulsingLogo(),
            ),
          ),

          // 3. Bottom Report Card
          Padding(
            padding: const EdgeInsets.only(bottom: 24, left: 16, right: 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                // Title outside, plain text, no capsule
                const Padding(
                  padding: EdgeInsets.only(left: 8.0, bottom: 8.0),
                  child: Text(
                    'PENGADUAN DARURAT',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF06B6D4),
                      fontFamily: 'monospace',
                      letterSpacing: 1.0,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: const Color(0xFF090D16).withOpacity(0.95),
                    border: Border.all(color: const Color(0xFF06B6D4).withOpacity(0.2)),
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFF06B6D4).withOpacity(0.05),
                        blurRadius: 15,
                        spreadRadius: 2,
                      )
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          SvgPicture.string(
                            '''<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24"><path d="M80-720v-120q0-33 23.5-56.5T160-920h120v80H160v120H80Zm200 600H160q-33 0-56.5-23.5T80-200v-120h80v120h120v80Zm520-600v-120H680v-80h120q33 0 56.5 23.5T880-840v120h-80Zm-316.5 76.5Q460-667 460-700t23.5-56.5Q507-780 540-780t56.5 23.5Q620-733 620-700t-23.5 56.5Q573-620 540-620t-56.5-23.5ZM352-280l40-204-72 28v136h-80v-188l158-68q35-15 51.5-19.5T480-600q21 0 39 11t29 29l40 64q11 17 24 31.5t30 26.5l-41 71q-17-11-32.5-24.5T540-420l-28 140H352ZM600-80q-23 0-34.5-20t-.5-40l160-280q13-19 36-21t34 21l160 280q13 20 0 40t-35 20H600Zm174-46q6-6 6-14t-6-14q-6-6-14-6t-14 6q-6 6-6 14t6 14q6 6 14 6t14-6Zm-34-74h40v-160h-40v160Z" fill="white"/></svg>''',
                            width: 52,
                            height: 52,
                          ),
                          const SizedBox(width: 16),
                          const Expanded(
                            child: Text(
                              'Melihat indikasi atau percobaan penculikan anak?',
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.bold,
                                color: Color(0xFFE2E8F0),
                                fontFamily: 'monospace',
                                height: 1.4,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Container(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(8),
                          boxShadow: [
                            BoxShadow(
                              color: const Color(0xFFEF4444).withOpacity(0.3),
                              blurRadius: 12,
                              spreadRadius: 2,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: ElevatedButton(
                          onPressed: () {
                            setState(() {
                              _showReportForm = true;
                              _incomingAlertData = {
                                'secure_token_id': 'PUBLIC_REPORT_SUBMISSION',
                                'victim_name': 'Laporan Mandiri',
                                'victim_age': '-',
                                'incident_location': '-',
                                'victim_clothing': '-',
                                'suspect_description': '-',
                                'ai_summary': 'Laporan mandiri saksi mata di lapangan.'
                              };
                            });
                          },
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFFEF4444), // Bright Red
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                            elevation: 0,
                          ),
                          child: const Text(
                            'LAPOR SEGERA',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                              fontFamily: 'monospace',
                              letterSpacing: 1.0,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      );
    } else if (_activeTab == "telemetry") {
      return SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _buildSectionHeader("Sistem Telemetri", "Status & Log Perangkat Seluler"),
            const SizedBox(height: 16),
            
            // Permissions cards
            Row(
              children: [
                Expanded(
                  child: _buildSimpleStatusCard(
                    "IZIN NOTIFIKASI",
                    _notificationsStatus,
                    _notificationsStatus.contains("DIIZINKAN"),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _buildSimpleStatusCard(
                    "IZIN LOKASI (GPS)",
                    "AKTIF (SELALU)",
                    true,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            
            _buildSimpleStatusCard(
              "IZIN TAMPIL DI ATAS APLIKASI LAIN",
              "DIIZINKAN (AKTIF)",
              true,
            ),
            const SizedBox(height: 16),

            ElevatedButton(
              onPressed: _requestAllPermissionsAndSetup,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF06B6D4).withOpacity(0.1),
                foregroundColor: const Color(0xFF06B6D4),
                side: BorderSide(color: const Color(0xFF06B6D4).withOpacity(0.2)),
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
              ),
              child: const Text(
                'AKTIFKAN MOCK NOTIFIKASI SISTEM',
                style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, fontFamily: 'monospace'),
              ),
            ),
            const SizedBox(height: 16),

            // Token Details
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF0B0F19),
                border: Border.all(color: const Color(0xFF1E293B)),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'FCM SERVICE TOKEN',
                        style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Color(0xFF10B981), fontFamily: 'monospace'),
                      ),
                      Text(
                        'ACTIVE',
                        style: TextStyle(fontSize: 7, color: Color(0xFF10B981), fontFamily: 'monospace'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Container(
                    constraints: const BoxConstraints(maxHeight: 60),
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.6),
                      border: Border.all(color: const Color(0xFF1E293B)),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: SingleChildScrollView(
                      child: SelectableText(
                        _fcmToken,
                        style: const TextStyle(fontSize: 8, color: Color(0xFF94A3B8), fontFamily: 'monospace', height: 1.3),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  ElevatedButton.icon(
                    onPressed: () {
                      Clipboard.setData(ClipboardData(text: _fcmToken));
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('TOKEN BERHASIL DISALIN!'),
                          backgroundColor: Color(0xFF06B6D4),
                        ),
                      );
                    },
                    icon: const Icon(Icons.copy, size: 10),
                    label: const Text('SALIN TOKEN REGISTRASI'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF1E293B).withOpacity(0.4),
                      foregroundColor: const Color(0xFFE2E8F0),
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(4),
                        side: BorderSide(color: Colors.white.withOpacity(0.1)),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Logger Telemetry
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF0B0F19),
                border: Border.all(color: const Color(0xFF1E293B)),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.radio_outlined, size: 12, color: Color(0xFF06B6D4)),
                      SizedBox(width: 6),
                      Text(
                        'LOG AKTIVITAS TELEMETRI',
                        style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Color(0xFF06B6D4), fontFamily: 'monospace'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Container(
                    height: 140,
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.6),
                      border: Border.all(color: const Color(0xFF1E293B)),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: ListView.builder(
                      itemCount: _telemetryLogs.length,
                      itemBuilder: (context, index) {
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 3.0),
                          child: Text(
                            _telemetryLogs[index],
                            style: const TextStyle(fontSize: 8, color: Color(0xFF94A3B8), fontFamily: 'monospace'),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    } else if (_activeTab == "how-it-works") {
      return SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _buildSectionHeader("Cara Kerja Geofencing", "Sistem Filter Sinyal Client-Side"),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFF0B0F19),
                border: Border.all(color: const Color(0xFF1E293B)),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'FILTRASI FORMULA HAVERSINE',
                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFF06B6D4), fontFamily: 'monospace'),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Sistem LAPANG memfilter sinyal notifikasi darurat secara client-side menggunakan Formula Haversine. Saat server memancarkan koordinat lokasi penculikan, perangkat penerima menghitung jarak antara lokasi kejadian dengan lokasi terkini perangkat.',
                    style: TextStyle(fontSize: 9, color: Color(0xFFCBD5E1), fontFamily: 'monospace', height: 1.5),
                  ),
                  const SizedBox(height: 12),
                  
                  // Formula Display Box
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.6),
                      border: Border.all(color: const Color(0xFF1E293B)),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: const Column(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Text('RUMUS HAVERSINE:', style: TextStyle(fontSize: 8, fontWeight: FontWeight.bold, color: Color(0xFF06B6D4), fontFamily: 'monospace')),
                        SizedBox(height: 4),
                        Text('a = sin²(Δlat/2) + cos(lat1) * cos(lat2) * sin²(Δlon/2)', style: TextStyle(fontSize: 8, color: Color(0xFF94A3B8), fontFamily: 'monospace'), textAlign: TextAlign.center),
                        Text('c = 2 * atan2(√a, √(1-a))', style: TextStyle(fontSize: 8, color: Color(0xFF94A3B8), fontFamily: 'monospace'), textAlign: TextAlign.center),
                        Text('d = R * c (R = 6371 km)', style: TextStyle(fontSize: 8, color: Color(0xFF94A3B8), fontFamily: 'monospace'), textAlign: TextAlign.center),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  
                  // Table Header
                  const Text('TABEL REFERENSI SEKTOR LOKASI:', style: TextStyle(fontSize: 8, fontWeight: FontWeight.bold, color: Color(0xFFCBD5E1), fontFamily: 'monospace')),
                  const SizedBox(height: 6),
                  
                  // Table
                  Table(
                    border: TableBorder.all(color: const Color(0xFF1E293B), width: 0.5),
                    columnWidths: const {
                      0: FlexColumnWidth(2),
                      1: FlexColumnWidth(1.5),
                      2: FlexColumnWidth(1.5),
                    },
                    children: [
                      TableRow(
                        decoration: const BoxDecoration(
                          color: Color(0xFF030712),
                        ),
                        children: const [
                          Padding(padding: EdgeInsets.all(6), child: Text('Sektor', style: TextStyle(fontSize: 8, fontWeight: FontWeight.bold, color: Color(0xFF06B6D4), fontFamily: 'monospace'))),
                          Padding(padding: EdgeInsets.all(6), child: Text('Latitude', style: TextStyle(fontSize: 8, fontWeight: FontWeight.bold, color: Color(0xFF06B6D4), fontFamily: 'monospace'), textAlign: TextAlign.center)),
                          Padding(padding: EdgeInsets.all(6), child: Text('Longitude', style: TextStyle(fontSize: 8, fontWeight: FontWeight.bold, color: Color(0xFF06B6D4), fontFamily: 'monospace'), textAlign: TextAlign.center)),
                        ],
                      ),
                      TableRow(
                        children: [
                          Padding(padding: EdgeInsets.all(6), child: Text('Kertek, Jateng', style: TextStyle(fontSize: 8, color: Color(0xFF94A3B8), fontFamily: 'monospace'))),
                          Padding(padding: EdgeInsets.all(6), child: Text('-7.3683', style: TextStyle(fontSize: 8, color: Color(0xFF94A3B8), fontFamily: 'monospace'), textAlign: TextAlign.center)),
                          Padding(padding: EdgeInsets.all(6), child: Text('109.9764', style: TextStyle(fontSize: 8, color: Color(0xFF94A3B8), fontFamily: 'monospace'), textAlign: TextAlign.center)),
                        ],
                      ),
                      TableRow(
                        children: [
                          Padding(padding: EdgeInsets.all(6), child: Text('Menteng, Jakarta', style: TextStyle(fontSize: 8, color: Color(0xFF94A3B8), fontFamily: 'monospace'))),
                          Padding(padding: EdgeInsets.all(6), child: Text('-6.2088', style: TextStyle(fontSize: 8, color: Color(0xFF94A3B8), fontFamily: 'monospace'), textAlign: TextAlign.center)),
                          Padding(padding: EdgeInsets.all(6), child: Text('106.8456', style: TextStyle(fontSize: 8, color: Color(0xFF94A3B8), fontFamily: 'monospace'), textAlign: TextAlign.center)),
                        ],
                      ),
                      TableRow(
                        children: [
                          Padding(padding: EdgeInsets.all(6), child: Text('Depok, DIY', style: TextStyle(fontSize: 8, color: Color(0xFF94A3B8), fontFamily: 'monospace'))),
                          Padding(padding: EdgeInsets.all(6), child: Text('-7.7972', style: TextStyle(fontSize: 8, color: Color(0xFF94A3B8), fontFamily: 'monospace'), textAlign: TextAlign.center)),
                          Padding(padding: EdgeInsets.all(6), child: Text('110.3783', style: TextStyle(fontSize: 8, color: Color(0xFF94A3B8), fontFamily: 'monospace'), textAlign: TextAlign.center)),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  
                  // ASCII Flowchart
                  const Text('DIAGRAM ALIR GEOFENCE (ASCII):', style: TextStyle(fontSize: 8, fontWeight: FontWeight.bold, color: Color(0xFFCBD5E1), fontFamily: 'monospace')),
                  const SizedBox(height: 6),
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.6),
                      border: Border.all(color: const Color(0xFF1E293B)),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: const Text(
                      ' [ Server: Siaran Sinyal FCM ]\n'
                      '             │\n'
                      '             ▼\n'
                      ' [ Device: Terima Payload GPS ]\n'
                      '             │\n'
                      '             ▼\n'
                      ' [ Device: Hitung Haversine ]\n'
                      '             │\n'
                      ' ┌───────────┴───────────┐\n'
                      ' ▼                       ▼\n'
                      '[ Jarak < 10 km? ]     [ Jarak >= 10 km? ]\n'
                      ' │                       │\n'
                      ' ▼                       ▼\n'
                      '[ SIRINE MENYALA ]     [ ABAIKAN / SENYAP ]\n'
                      '[ Takeover Overlay ]   [ Simpan di Log ]',
                      style: TextStyle(fontSize: 7, color: Color(0xFF34D399), fontFamily: 'monospace', height: 1.3),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    } else if (_activeTab == "license") {
      return SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _buildSectionHeader("Lisensi Kode", "Apache License 2.0"),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF0B0F19),
                border: Border.all(color: const Color(0xFF1E293B)),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Apache License, Version 2.0',
                    style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Color(0xFFCBD5E1), fontFamily: 'monospace'),
                  ),
                  SizedBox(height: 4),
                  Text(
                    'Copyright 2026 Rahman (project-flash0 / LAPANG)',
                    style: TextStyle(fontSize: 8, color: Color(0xFF94A3B8), fontFamily: 'monospace'),
                  ),
                  SizedBox(height: 10),
                  Text(
                    'Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.\n\nYou may obtain a copy of the License at:\nhttp://www.apache.org/licenses/LICENSE-2.0\n\nUnless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.\n\nTERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION\n\n1. Definitions.\n"License" shall mean the terms and conditions for use, reproduction, and distribution as defined by Sections 1 through 9 of this document.\n"Licensor" shall mean the copyright owner or entity authorized by the copyright owner that is granting the License.\n"Legal Entity" shall mean the union of the acting entity and all other entities that control, are controlled by, or are under common control with that entity.\n\n2. Grant of Copyright License.\nSubject to the terms and conditions of this License, each Contributor hereby grants to You a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable copyright license to reproduce, prepare Derivative Works of, publicly display, publicly perform, sublicense, and distribute the Work.\n\n3. Grant of Patent License.\nSubject to the terms and conditions of this License, each Contributor hereby grants to You a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable patent license to make, have made, use, offer to sell, sell, import, and otherwise transfer the Work.',
                    style: TextStyle(fontSize: 8, color: Color(0xFF94A3B8), fontFamily: 'monospace', height: 1.4),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    } else if (_activeTab == "about") {
      return SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _buildSectionHeader("Tentang Proyek", "Detail Submisi Resmi"),
            const SizedBox(height: 16),
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: Image.asset(
                'assets/gdc-jvc-mobile-banner.jpg',
                width: double.infinity,
                fit: BoxFit.cover,
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'LAPANG adalah solusi kemanusiaan taktis yang dirancang untuk mempercepat koordinasi pencarian anak hilang menggunakan penyaringan geofencing berbasis koordinat GPS.',
              style: TextStyle(fontSize: 13, color: Color(0xFFCBD5E1), fontFamily: 'monospace', height: 1.5),
            ),
            const SizedBox(height: 20),
            
            // Blok 1: Kreator Proyek
            const Text(
              'KREATOR PROYEK:',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: Color(0xFF06B6D4),
                fontFamily: 'monospace',
                letterSpacing: 1.0,
              ),
            ),
            const SizedBox(height: 8),
            const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      width: 100,
                      child: Text(
                        'Nama:',
                        style: TextStyle(fontSize: 12, color: Color(0xFF64748B), fontFamily: 'monospace'),
                      ),
                    ),
                    Expanded(
                      child: Text(
                        'Rahman Hanafi',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFFE2E8F0), fontFamily: 'monospace'),
                      ),
                    ),
                  ],
                ),
                SizedBox(height: 6),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      width: 100,
                      child: Text(
                        'Versi:',
                        style: TextStyle(fontSize: 12, color: Color(0xFF64748B), fontFamily: 'monospace'),
                      ),
                    ),
                    Expanded(
                      child: Text(
                        'v0.3.0',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFFE2E8F0), fontFamily: 'monospace'),
                      ),
                    ),
                  ],
                ),
                SizedBox(height: 6),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      width: 100,
                      child: Text(
                        'Lisensi:',
                        style: TextStyle(fontSize: 12, color: Color(0xFF64748B), fontFamily: 'monospace'),
                      ),
                    ),
                    Expanded(
                      child: Text(
                        'Apache License 2.0',
                        style: TextStyle(fontSize: 12, color: Color(0xFFE2E8F0), fontFamily: 'monospace'),
                      ),
                    ),
                  ],
                ),
                SizedBox(height: 6),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      width: 100,
                      child: Text(
                        'Teknologi:',
                        style: TextStyle(fontSize: 12, color: Color(0xFF64748B), fontFamily: 'monospace'),
                      ),
                    ),
                    Expanded(
                      child: Text(
                        'Flutter SDK, Next.js, Firebase FCM, Geolocator',
                        style: TextStyle(fontSize: 12, color: Color(0xFFE2E8F0), fontFamily: 'monospace'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 16),
            OutlinedButton(
              onPressed: () => _openLink('https://github.com/fromrha/project-flash0'),
              style: OutlinedButton.styleFrom(
                foregroundColor: const Color(0xFF06B6D4),
                side: BorderSide(color: const Color(0xFF06B6D4).withOpacity(0.3), width: 1.0),
                shape: const StadiumBorder(),
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
              child: const Text(
                'REPOSITORI GITHUB',
                style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, fontFamily: 'monospace', letterSpacing: 1.0),
              ),
            ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: () => _openLink('https://github.com/fromrha'),
              style: OutlinedButton.styleFrom(
                foregroundColor: const Color(0xFF94A3B8),
                side: BorderSide(color: const Color(0xFF334155), width: 1.0),
                shape: const StadiumBorder(),
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
              child: const Text(
                'PORTOFOLIO GITHUB',
                style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, fontFamily: 'monospace', letterSpacing: 1.0),
              ),
            ),
            const SizedBox(height: 24),
            
            // Divider line
            Container(
              height: 0.5,
              color: const Color(0xFF1E293B),
            ),
            const SizedBox(height: 20),

            // Blok 2: Submisi Resmi Google
            const Text(
              'SUBMISI RESMI GOOGLE:',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: Color(0xFF06B6D4),
                fontFamily: 'monospace',
                letterSpacing: 1.0,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Proyek ini dikembangkan secara khusus sebagai submisi resmi untuk ajang kompetisi Google Juara Vibe Coding. Mengintegrasikan teknologi cloud, geofencing real-time, dan push notification berkecepatan tinggi.',
              style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8), fontFamily: 'monospace', height: 1.5),
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () => _openLink('https://rsvp.withgoogle.com/events/juaravibecoding'),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF2563EB),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                shadowColor: const Color(0xFF2563EB).withOpacity(0.4),
                elevation: 4,
              ),
              child: const Text(
                'KUNJUNGI GOOGLE VIBE CODING',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, fontFamily: 'monospace', letterSpacing: 1.0),
              ),
            ),
            const SizedBox(height: 12),
          ],
        ),
      );
    }
    return const SizedBox.shrink();
  }

  Widget _buildSectionHeader(String title, String subtitle) {
    return Container(
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: Color(0xFF1E293B), width: 0.5)),
      ),
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF06B6D4), fontFamily: 'monospace'),
          ),
          const SizedBox(height: 2),
          Text(
            subtitle,
            style: const TextStyle(fontSize: 8, color: Color(0xFF64748B), fontFamily: 'monospace'),
          ),
        ],
      ),
    );
  }

  Widget _buildSimpleStatusCard(String label, String value, bool isSuccess) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFF0B0F19),
        border: Border.all(color: const Color(0xFF1E293B)),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(fontSize: 8, color: Color(0xFF94A3B8), fontFamily: 'monospace'),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
              fontSize: 9,
              fontWeight: FontWeight.bold,
              fontFamily: 'monospace',
              color: isSuccess ? const Color(0xFF10B981) : Colors.redAccent,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDrawerItem(String id, String label, IconData icon) {
    final bool isActive = _activeTab == id;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4.0),
      child: InkWell(
        onTap: () {
          setState(() {
            _activeTab = id;
          });
          Navigator.pop(context);
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: isActive ? const Color(0xFF06B6D4).withOpacity(0.1) : Colors.transparent,
            border: Border.all(
              color: isActive ? const Color(0xFF06B6D4).withOpacity(0.2) : Colors.transparent,
            ),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            children: [
              Icon(
                icon,
                size: 16,
                color: isActive ? const Color(0xFF06B6D4) : const Color(0xFF94A3B8),
              ),
              const SizedBox(width: 12),
              Text(
                label.toUpperCase(),
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  fontFamily: 'monospace',
                  color: isActive ? const Color(0xFF06B6D4) : const Color(0xFF94A3B8),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildEmergencyOverlay(Map<String, dynamic> data) {
    final String victimName = data['victim_name'] ?? 'ANONIM';
    final String victimAge = data['victim_age'] ?? '0';
    final String lastSeen = data['incident_location'] ?? 'Tidak diketahui';
    final String clothing = data['victim_clothing'] ?? 'Pakaian tidak didetailkan';
    final String suspect = data['suspect_description'] ?? 'Mencari petunjuk kendaraan...';
    final String summary = data['ai_summary'] ?? 'SIAGA 1: Penculikan Anak!';
    final String tokenId = data['secure_token_id'] ?? '';

    return Container(
      color: const Color(0xFF030712), // Deep tactical dark background
      width: double.infinity,
      height: double.infinity,
      child: _showReportForm
          ? _buildReportFormLayout(tokenId)
          : _buildAlertDetailsLayout(victimName, victimAge, lastSeen, clothing, suspect, summary, tokenId),
    );
  }

  Widget _buildAlertDetailsLayout(
    String victimName,
    String victimAge,
    String lastSeen,
    String clothing,
    String suspect,
    String summary,
    String tokenId,
  ) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 16.0),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          const SizedBox(height: 20),
          
          // Tactical Alert Header
          Column(
            children: [
              Container(
                height: 72,
                width: 72,
                decoration: BoxDecoration(
                  color: const Color(0xFFEF4444).withOpacity(0.1),
                  shape: BoxShape.circle,
                  border: Border.all(color: const Color(0xFFEF4444), width: 2),
                ),
                child: const Icon(
                  Icons.gpp_bad, // Shield warning icon
                  color: Color(0xFFEF4444),
                  size: 40,
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'SIAGA 1: PENCULIKAN ANAK',
                style: TextStyle(
                  color: Color(0xFFEF4444),
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 2.0,
                  fontFamily: 'monospace',
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 6),
              const Text(
                'PERINGATAN DITERIMA: AREA RADIUS SIAGA 1',
                style: TextStyle(
                  color: Colors.white38,
                  fontSize: 10,
                  letterSpacing: 1.0,
                  fontFamily: 'monospace',
                ),
              ),
            ],
          ),
          
          // Main Tactical Information Card
          Expanded(
            child: Container(
              margin: const EdgeInsets.symmetric(vertical: 24.0),
              padding: const EdgeInsets.all(20.0),
              decoration: BoxDecoration(
                color: const Color(0xFF0B0F19), // dark card
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFEF4444).withOpacity(0.3), width: 1.5),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFFEF4444).withOpacity(0.1),
                    blurRadius: 16,
                    spreadRadius: 2,
                  )
                ]
              ),
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Header with Name and Badge
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(
                            '$victimName, (${victimAge}th)',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                              letterSpacing: 1.0,
                              fontFamily: 'monospace',
                            ),
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: const Color(0xFFEF4444).withOpacity(0.2),
                            borderRadius: BorderRadius.circular(4),
                            border: Border.all(color: const Color(0xFFEF4444)),
                          ),
                          child: const Text(
                            'AKTIF',
                            style: TextStyle(
                              color: Color(0xFFEF4444),
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                              fontFamily: 'monospace',
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    
                    // Info details
                    _buildAlertDetailRow('TERAKHIR TERLIHAT:', lastSeen),
                    const SizedBox(height: 12),
                    _buildAlertDetailRow('PAKAIAN TERAKHIR:', clothing),
                    const SizedBox(height: 12),
                    _buildAlertDetailRow('KENDARAAN PENCULIK:', suspect),
                    const SizedBox(height: 20),
                    
                    // Quote Box
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12.0),
                      decoration: BoxDecoration(
                        color: const Color(0xFFEF4444).withOpacity(0.05),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: const Color(0xFFEF4444).withOpacity(0.15)),
                      ),
                      child: Text(
                        '"$summary"',
                        style: const TextStyle(
                          color: Color(0xFFFDA4AF), // soft pink
                          fontSize: 11,
                          fontStyle: FontStyle.italic,
                          height: 1.4,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          
          // Action Buttons
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () {
                    setState(() {
                      _showReportForm = true;
                    });
                  },
                  icon: const Icon(Icons.warning_amber_rounded, size: 18),
                  label: const Text('LAPOR PETUNJUK', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, fontFamily: 'monospace')),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white70,
                    side: const BorderSide(color: Colors.white24),
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: () {
                    final String secureLink = 'https://lapang.polri.go.id/report/$tokenId';
                    final String copyText = "DITEMUKAN ALERT LAPANG: $summary\nLapor di: $secureLink";
                    Clipboard.setData(ClipboardData(text: copyText));
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('SUKSES: Teks & link disalin ke clipboard!'),
                        backgroundColor: Color(0xFF2563EB),
                      ),
                    );
                    
                    // Close the alert overlay
                    _setIncomingAlert(null);
                    
                    // Native exit and restore window flags silently to background
                    const MethodChannel('com.lapang.emergency.sdk/overlay').invokeMethod('exitEmergencyMode');
                  },
                  icon: const Icon(Icons.copy, size: 18),
                  label: const Text('Simpan', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, fontFamily: 'monospace')),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2563EB), // Tactical Blue
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
        ],
      ),
    );
  }

  Widget _buildReportFormLayout(String tokenId) {
    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Header with Back Arrow
          Row(
            children: [
              IconButton(
                icon: const Icon(Icons.arrow_back, color: Colors.white70),
                onPressed: () {
                  setState(() {
                    if (tokenId == 'PUBLIC_REPORT_SUBMISSION') {
                      _incomingAlertData = null;
                    }
                    _showReportForm = false;
                  });
                },
              ),
              const SizedBox(width: 8),
              const Text(
                'FORM PENGADUAN SAKSI',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 1.0,
                  fontFamily: 'monospace',
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          
          // Case token banner
          Container(
            padding: const EdgeInsets.all(10.0),
            decoration: BoxDecoration(
              color: const Color(0xFFEF4444).withOpacity(0.05),
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: const Color(0xFFEF4444).withOpacity(0.2)),
            ),
            child: Text(
              'KASUS: $tokenId',
              style: const TextStyle(
                color: Color(0xFFF43F5E),
                fontSize: 10,
                fontWeight: FontWeight.bold,
                fontFamily: 'monospace',
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(height: 16),
          
          // Text Area input
          Expanded(
            child: TextField(
              controller: _reportController,
              maxLines: null,
              keyboardType: TextInputType.multiline,
              textInputAction: TextInputAction.newline,
              style: const TextStyle(color: Colors.white, fontSize: 13, height: 1.4, fontFamily: 'monospace'),
              decoration: InputDecoration(
                hintText: 'Deskripsikan petunjuk yang Anda lihat...',
                hintStyle: TextStyle(color: Colors.grey.shade600, fontSize: 13, fontFamily: 'monospace'),
                fillColor: const Color(0xFF0B0F19),
                filled: true,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: Colors.white24),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: Colors.white12),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: Color(0xFF06B6D4)),
                ),
                contentPadding: const EdgeInsets.all(16),
              ),
            ),
          ),
          const SizedBox(height: 16),
          
          // Submit Button
          ElevatedButton(
            onPressed: () {
              if (_reportController.text.trim().isEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Harap masukkan deskripsi petunjuk terlebih dahulu.'),
                    backgroundColor: Colors.amber,
                  ),
                );
                return;
              }
              
              // Mock submit log
              _addLog("Lapor Petunjuk Dikirim: ${_reportController.text}");
              
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Laporan berhasil dikirim ke server POLRI!'),
                  backgroundColor: Color(0xFF059669),
                ),
              );
              
              // Clear state, overlay, and exit app
              _reportController.clear();
              _setIncomingAlert(null);
              const MethodChannel('com.lapang.emergency.sdk/overlay').invokeMethod('exitEmergencyMode');
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF059669), // Emerald Green
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            child: const Text(
              'KIRIM LAPORAN ONLINE',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 1.0, fontFamily: 'monospace'),
            ),
          ),
          const SizedBox(height: 12),
        ],
      ),
    );
  }

  Widget _buildAlertDetailRow(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: Color(0xFFF43F5E), // Rose red
            fontSize: 10,
            fontWeight: FontWeight.bold,
            letterSpacing: 0.5,
            fontFamily: 'monospace',
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 12,
            height: 1.3,
            fontFamily: 'monospace',
          ),
        ),
      ],
    );
  }
}

class BlinkingDot extends StatefulWidget {
  const BlinkingDot({super.key});

  @override
  State<BlinkingDot> createState() => _BlinkingDotState();
}

class _BlinkingDotState extends State<BlinkingDot> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _opacityAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 1),
    )..repeat(reverse: true);
    _opacityAnimation = Tween<double>(begin: 0.2, end: 1.0).animate(_controller);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _opacityAnimation,
      child: Container(
        width: 6,
        height: 6,
        decoration: const BoxDecoration(
          color: Color(0xFF34D399),
          shape: BoxShape.circle,
        ),
      ),
    );
  }
}

class CyberGridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0xFF06B6D4).withOpacity(0.04)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.5;

    const double step = 20.0;
    
    // Draw vertical lines
    for (double x = 0; x < size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    
    // Draw horizontal lines
    for (double y = 0; y < size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class LapangLogomarkPainter extends CustomPainter {
  final Color color;

  LapangLogomarkPainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;

    final scaleX = size.width / 365.0;
    final scaleY = size.height / 364.0;

    canvas.save();
    canvas.scale(scaleX, scaleY);

    final path1 = Path()
      ..moveTo(63.1958, 132.105)
      ..cubicTo(63.8218, 115.344, 65.133, 98.5581, 64.8141, 81.82)
      ..cubicTo(64.6133, 70.906, 67.1765, 65.4371, 79.2015, 66.8221)
      ..cubicTo(98.9989, 69.0948, 112.394, 60.1221, 123.805, 43.7983)
      ..cubicTo(148.941, 7.85997, 185.37, -3.03043, 228.533, 0.68651)
      ..lineTo(228.533, 64.9399)
      ..cubicTo(224.505, 65.295, 220.76, 66.1473, 217.098, 65.8514)
      ..cubicTo(196.793, 64.206, 183.043, 72.7881, 171.219, 89.5617)
      ..cubicTo(144.783, 127.074, 106.5, 137.101, 62.8178, 131.703)
      ..lineTo(63.2076, 132.093)
      ..lineTo(63.1958, 132.105)
      ..close();
    canvas.drawPath(path1, paint);

    final path2 = Path()
      ..moveTo(301.698, 232.475)
      ..cubicTo(301.084, 249.722, 299.985, 266.969, 300.068, 284.204)
      ..cubicTo(300.115, 293.52, 297.209, 297.568, 287.665, 296.657)
      ..cubicTo(266.934, 294.692, 252.535, 303.392, 240.617, 320.829)
      ..cubicTo(217.618, 354.471, 173.275, 370.842, 136.267, 361.325)
      ..lineTo(136.267, 298.906)
      ..cubicTo(140.153, 298.527, 143.425, 297.663, 146.579, 297.983)
      ..cubicTo(168.089, 300.137, 182.181, 290.584, 194.785, 273.136)
      ..cubicTo(221.15, 236.641, 258.748, 226.165, 302.029, 232.841)
      ..lineTo(301.686, 232.475)
      ..close();
    canvas.drawPath(path2, paint);

    final path3 = Path()
      ..moveTo(302.029, 232.842)
      ..cubicTo(304.332, 199.519, 286.247, 179.1, 261.879, 158.763)
      ..cubicTo(234.557, 135.964, 229.926, 102.18, 233.848, 66.822)
      ..lineTo(297.067, 66.822)
      ..cubicTo(297.493, 70.03, 298.39, 72.8117, 298.131, 75.4752)
      ..cubicTo(295.886, 98.0136, 305.49, 113.071, 323.905, 126.281)
      ..cubicTo(358.503, 151.092, 368.874, 187.126, 363.76, 232.392)
      ..lineTo(301.651, 232.427)
      ..lineTo(302.017, 232.83)
      ..close();
    canvas.drawPath(path3, paint);

    final path4 = Path()
      ..moveTo(62.8178, 131.715)
      ..cubicTo(60.9751, 164.421, 78.7171, 184.509, 102.779, 204.491)
      ..cubicTo(130.242, 227.313, 135.121, 261.121, 130.549, 296.811)
      ..lineTo(68.0743, 296.811)
      ..cubicTo(67.6254, 292.845, 66.7395, 289.566, 66.9639, 286.358)
      ..cubicTo(68.405, 265.667, 60.29, 251.154, 42.9259, 238.914)
      ..cubicTo(7.13462, 213.7, -4.20518, 177.371, 1.33478, 132.176)
      ..lineTo(63.243, 132.141)
      ..lineTo(62.8296, 131.715)
      ..close();
    canvas.drawPath(path4, paint);

    final path5 = Path()
      ..moveTo(190.367, 139.835)
      ..lineTo(204.707, 121.345)
      ..cubicTo(205.558, 120.244, 207.318, 120.966, 207.152, 122.351)
      ..lineTo(204.483, 145.612)
      ..cubicTo(202.486, 163.025, 209.692, 180.213, 223.5, 190.961)
      ..lineTo(241.951, 205.331)
      ..cubicTo(243.05, 206.184, 242.329, 207.948, 240.947, 207.782)
      ..lineTo(217.736, 205.107)
      ..cubicTo(200.36, 203.106, 183.209, 210.327, 172.483, 224.165)
      ..lineTo(158.143, 242.655)
      ..cubicTo(157.293, 243.756, 155.533, 243.034, 155.698, 241.649)
      ..lineTo(158.367, 218.388)
      ..cubicTo(160.364, 200.975, 153.158, 183.787, 139.35, 173.039)
      ..lineTo(120.899, 158.668)
      ..cubicTo(119.8, 157.816, 120.521, 156.052, 121.903, 156.218)
      ..lineTo(145.114, 158.893)
      ..cubicTo(162.49, 160.894, 179.641, 153.673, 190.367, 139.835)
      ..close();
    canvas.drawPath(path5, paint);

    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class PulsingLogo extends StatefulWidget {
  const PulsingLogo({super.key});

  @override
  State<PulsingLogo> createState() => _PulsingLogoState();
}

class _PulsingLogoState extends State<PulsingLogo> with TickerProviderStateMixin {
  late AnimationController _pulseController;
  late Animation<double> _scaleAnimation;
  late Animation<double> _opacityAnimation;
  
  late AnimationController _blinkController;
  late Animation<double> _blinkAnimation;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 3),
    )..repeat(reverse: true);

    _scaleAnimation = Tween<double>(begin: 1.0, end: 1.08).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );

    _opacityAnimation = Tween<double>(begin: 0.95, end: 1.0).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );

    _blinkController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);

    _blinkAnimation = Tween<double>(begin: 0.25, end: 1.0).animate(
      CurvedAnimation(parent: _blinkController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _blinkController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _pulseController,
      builder: (context, child) {
        return Stack(
          alignment: Alignment.center,
          children: [
            // Outer glow ring pulsing scale
            Transform.scale(
              scale: 1.0 + (_scaleAnimation.value - 1.0) * 3.0,
              child: Opacity(
                opacity: 0.35 - (_scaleAnimation.value - 1.0) * 2.5,
                child: Container(
                  width: 140,
                  height: 140,
                  decoration: BoxDecoration(
                    color: const Color(0xFF06B6D4).withOpacity(0.1),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: const Color(0xFF06B6D4).withOpacity(0.3),
                      width: 1,
                    ),
                  ),
                ),
              ),
            ),
            
            // Main logo container
            Transform.scale(
              scale: _scaleAnimation.value,
              child: Opacity(
                opacity: _opacityAnimation.value,
                child: Container(
                  width: 110,
                  height: 110,
                  decoration: BoxDecoration(
                    color: const Color(0xFF030712),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: const Color(0xFF1E293B),
                      width: 1.5,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFF06B6D4).withOpacity(0.15 * _opacityAnimation.value),
                        blurRadius: 20 * _scaleAnimation.value,
                        spreadRadius: 2,
                      )
                    ]
                  ),
                  child: Stack(
                    children: [
                      Padding(
                        padding: const EdgeInsets.all(28.0),
                        child: SizedBox.expand(
                          child: CustomPaint(
                            painter: LapangLogomarkPainter(
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                      
                      // Blinking green dot inside the logo circle
                      Positioned(
                        bottom: 12,
                        right: 12,
                        child: AnimatedBuilder(
                          animation: _blinkController,
                          builder: (context, child) {
                            return Opacity(
                              opacity: _blinkAnimation.value,
                              child: Container(
                                width: 8,
                                height: 8,
                                decoration: BoxDecoration(
                                  color: const Color(0xFF34D399),
                                  shape: BoxShape.circle,
                                  border: Border.all(color: const Color(0xFF030712), width: 1),
                                  boxShadow: const [
                                    BoxShadow(
                                      color: Color(0xFF34D399),
                                      blurRadius: 4,
                                      spreadRadius: 1,
                                    )
                                  ]
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

