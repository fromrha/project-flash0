import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:geolocator/geolocator.dart';
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
    );

    await flutterLocalNotificationsPlugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(channel);

    // Daftarkan listener pesan foreground agar alert muncul saat aplikasi terbuka
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      print("[LAPANG Foreground SDK] Sinyal FCM Diterima di Foreground: ${message.messageId}");
      firebaseMessagingBackgroundHandler(message);
    });

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
  Map<String, dynamic>? _incomingAlertData;
  List<String> _telemetryLogs = [];
  bool _showReportForm = false;
  final TextEditingController _reportController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _telemetryLogs = [
      "[${DateTime.now().toIso8601String().substring(11, 19)}] LAPANG SDK: FlashZeroService aktif.",
      "[${DateTime.now().toIso8601String().substring(11, 19)}] GEOLOCATOR: GPS service initialized.",
      "[${DateTime.now().toIso8601String().substring(11, 19)}] FCM: Mendengarkan sinyal..."
    ];
    _requestAllPermissionsAndSetup();
    _setupFcmUiListeners();
    _setupLocalNotificationListeners();
    _setupNativeOverlayChannel();
  }

  @override
  void dispose() {
    _reportController.dispose();
    super.dispose();
  }

  void _addLog(String msg) {
    final String timestamp = DateTime.now().toIso8601String().substring(11, 19);
    setState(() {
      _telemetryLogs.insert(0, "[$timestamp] $msg");
    });
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

  String? _lastProcessedTokenId;

  void _handleIncomingAlert(Map<String, dynamic> data) {
    final String victimName = data['victim_name'] ?? '';
    final String tokenId = data['secure_token_id'] ?? '';
    
    if (victimName.isEmpty && tokenId.isEmpty) {
      return; // Ignore empty/corrupted payloads
    }

    if (tokenId.isNotEmpty && tokenId == _lastProcessedTokenId) {
      _addLog("Abaikan alert duplikat untuk Kasus: $tokenId");
      return; // Deduplicate
    }

    _lastProcessedTokenId = tokenId.isNotEmpty ? tokenId : victimName;

    setState(() {
      _incomingAlertData = data;
      _showReportForm = false; // Reset to details screen for new alert
    });
    _addLog("SIAGA 1 PENCULIKAN: ${data['victim_name']} (${data['victim_age']}th)");
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
      appBar: _incomingAlertData == null
          ? AppBar(
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
            )
          : null,
      body: Stack(
        children: [
          // Background/Main Dashboard View
          SingleChildScrollView(
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
                          Clipboard.setData(ClipboardData(text: _fcmToken));
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
                        height: 120,
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: Colors.black,
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: Colors.white10),
                        ),
                        child: ListView.builder(
                          itemCount: _telemetryLogs.length,
                          itemBuilder: (context, index) {
                            return Padding(
                              padding: const EdgeInsets.symmetric(vertical: 2.0),
                              child: Text(
                                _telemetryLogs[index],
                                style: const TextStyle(
                                  fontSize: 9,
                                  color: Colors.grey,
                                  fontFamily: 'monospace',
                                ),
                              ),
                            );
                          },
                        ),
                      )
                    ],
                  ),
                ],
              ),
            ),
          ),
          
          // Fullscreen Visual Emergency Takeover Overlay
          if (_incomingAlertData != null)
            _buildEmergencyOverlay(_incomingAlertData!),
        ],
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
      child: SafeArea(
        child: _showReportForm
            ? _buildReportFormLayout(tokenId)
            : _buildAlertDetailsLayout(victimName, victimAge, lastSeen, clothing, suspect, summary, tokenId),
      ),
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
                'DARURAT PUSH-ALERT INTENT DILEPAS',
                style: TextStyle(
                  color: Colors.white38,
                  fontSize: 10,
                  letterSpacing: 1.0,
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
                              fontSize: 20,
                              fontWeight: FontWeight.bold,
                              letterSpacing: 1.0,
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
                  label: const Text('LAPOR PETUNJUK', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
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
                    
                    // Stop siren via MethodChannel
                    const MethodChannel('com.lapang.emergency.sdk/overlay').invokeMethod('stopSiren');

                    // Close the alert and exit the app to prevent returning to dashboard UI
                    setState(() {
                      _incomingAlertData = null;
                    });
                    SystemNavigator.pop();
                  },
                  icon: const Icon(Icons.copy, size: 18),
                  label: const Text('SIMPAN & SALIN', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
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
              style: const TextStyle(color: Colors.white, fontSize: 13, height: 1.4),
              decoration: InputDecoration(
                hintText: 'Deskripsikan petunjuk yang Anda lihat...',
                hintStyle: TextStyle(color: Colors.grey.shade600, fontSize: 13),
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
              
              // Stop siren via MethodChannel
              const MethodChannel('com.lapang.emergency.sdk/overlay').invokeMethod('stopSiren');

              // Clear state, overlay, and exit app
              _reportController.clear();
              setState(() {
                _showReportForm = false;
                _incomingAlertData = null;
              });
              SystemNavigator.pop();
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF059669), // Emerald Green
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            child: const Text(
              'KIRIM LAPORAN ONLINE',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 1.0),
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
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 12,
            height: 1.3,
          ),
        ),
      ],
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
