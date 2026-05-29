# Contributing to LAPANG

LAPANG is an open-source emergency alert framework built to protect children in Indonesia. Contributions from developers, security researchers, and public safety professionals are welcome.

## Before You Start

Read the [Technical Blueprint](docs/BLUEPRINT.md) to understand the project's architecture and design decisions.

## Development Setup

### Dashboard (Next.js Command Center)

```bash
cd dashboard
cp .env.example .env.local   # Configure Firebase credentials
npm install
npm run dev                   # Runs on http://localhost:3000
```

### Mobile SDK (Flutter Standalone Client)

```bash
cd mobile_sdk
flutter pub get
flutter run                   # Requires Android device or emulator
```

### Environment Variables

Create a `.env.local` file in `dashboard/` with the following keys:

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=
```

## Branching Model

| Branch | Purpose |
|:-------|:--------|
| `master` | Production-ready code |
| `feat/*` | New feature development |
| `fix/*` | Bug fixes and patches |

## Commit Conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(dashboard): add geofence radius visualization
fix(sdk): resolve background isolate crash on Android 14
docs(readme): update architecture diagram
```

## Pull Request Guidelines

1. Fork the repository and create your branch from `master`
2. Write clear, descriptive commit messages
3. Ensure the dashboard builds without errors (`npm run build`)
4. Ensure the Flutter SDK compiles (`flutter build apk --release`)
5. Update documentation if your changes affect the public API

## Reporting Security Vulnerabilities

Do not open a public issue for security vulnerabilities. See [SECURITY.md](SECURITY.md) for responsible disclosure procedures.

## Code of Conduct

All contributors are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
