# Hand URDF Web Viewer

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker Build Status](https://img.shields.io/docker/cloud/build/username/hand-urdf-viewer)](https://hub.docker.com/r/username/hand-urdf-viewer)
[![GitHub stars](https://img.shields.io/github/stars/username/hand-urdf-viewer?style=social)](https://github.com/username/hand-urdf-viewer)

A web-based 3D hand model (URDF) viewer with real-time joint control. Visualize and interact with robotic hand models directly in your browser.

**Key Features**
- 🖐️ 5-finger hand model with realistic joint constraints
- 🎮 Interactive joint control with sliders
- 📸 Real-time hand tracking via webcam using MediaPipe
- 🖱️ Intuitive camera controls (rotate, zoom, pan)
- 📤 Load custom URDF files
- 🐳 Docker support for easy deployment
- ⚡ Real-time updates with Three.js

## 🚀 Quick Start

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)
- Modern web browser (Chrome, Firefox, Edge)
- A webcam for the hand tracking feature

### Running with Docker
```bash
git clone https://github.com/yourusername/hand_webviewer.git
cd hand_webviewer
docker-compose up --build -d
```
Then open `http://localhost:5173` in your browser.

For detailed installation and development instructions, see [INSTALLATION.md](INSTALLATION.md).

## 🛠️ Features

### New Feature: Camera Hand Tracking
- **Real-time Control**: Control the 3D robot hand in real-time using your own hand movements via a webcam.
- **MediaPipe Integration**: Utilizes Google's MediaPipe Hand Landmarker to detect hand landmarks and calculate joint angles.
- **Easy Activation**: Simply click the "Camera Capture Mode" button to start the webcam and enable tracking.
- **Recording**: Record a sequence of joint angles captured from your hand movements and save it as a JSON file.
- **Playback**: Load a recorded sequence to play it back on the 3D model.

**Note**: You will need to grant camera permissions in your browser to use this feature.

### Hand Model
- 5-finger URDF model with realistic joint constraints
- Thumb with roll and pitch joints for natural movement
- Pre-configured joint limits based on human hand anatomy

### Controls
- **Rotate**: Left-click and drag
- **Pan**: Right-click and drag
- **Zoom**: Scroll wheel or two-finger touchpad gesture
- **Reset View**: Click the reset button in the UI

### URDF Support
- Load custom URDF files
- Visualize joint hierarchies and limits
- Real-time joint angle updates

### 🤖 Model Modifications

The default `default.urdf` hand model has been significantly improved for more realistic, human-like motion:

*   **Thumb:**
    *   **4-DOF Movement:** The thumb now has 4 degrees of freedom, including a base rotation (abduction) and proper inward flexion.
    *   **Corrected Orientation:** The thumb's links are now oriented to extend from the side of the palm, not from the top like the other fingers.
    *   **Natural Placement:** The base of the thumb has been lowered to the vertical midpoint of the palm.

*   **Fingers (Index, Middle, Ring, Pinky):**
    *   **Corrected Bending Direction:** All four fingers now bend inwards towards the thumb, allowing the hand to close into a natural fist.
    *   **Realistic Joint Limits:** The joint limits have been adjusted to allow for >90 degrees of inward flexion while preventing unnatural outward movement.

## 🏗️ Project Structure

```
hand_webviewer/
├── public/                 # Static files
│   ├── hand_4dof.urdf      # Default hand URDF model
│   └── ...
├── src/
│   ├── App.tsx            # Main application component
│   ├── main.tsx           # Entry point
│   └── ...
├── docker-compose.yml     # Docker configuration
├── package.json           # Node.js dependencies
└── README.md             # This file
```

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Three.js](https://threejs.org/) - 3D library
- [urdf-loader](https://github.com/gkjohnson/urdf-loaders) - URDF loader for Three.js
- [MediaPipe](https://developers.google.com/mediapipe) - Hand tracking ML models
- [Vite](https://vitejs.dev/) - Frontend tooling

---

<div align="center">
  Made with ❤️ by Your Name | 
  <a href="https://github.com/yourusername/hand_webviewer">GitHub</a> | 
  <a href="https://yourwebsite.com">Website</a>
</div>

---

## 빠른 시작 (Docker 권장)

사전 요구 사항:
- Docker Engine, Docker Compose v2
- 현재 사용자에 docker 권한 부여(권장):
  ```bash
  sudo usermod -aG docker $USER
  newgrp docker
  docker ps
  ```

### Docker 설치 가이드 (Ubuntu)
- 패키지 준비
  ```bash
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl gnupg
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update
  ```
- Docker Engine / CLI / Compose 설치
  ```bash
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  ```
- 서비스 활성화 및 권한 설정
  ```bash
  sudo systemctl enable --now docker
  sudo usermod -aG docker $USER
  newgrp docker
  docker version
  docker compose version
  ```
- 문제 해결
  - permission denied to /var/run/docker.sock → 위의 docker 그룹 추가/세션 갱신(newgrp) 진행
  - 방화벽으로 5173 포트 접근 안 될 때 → 로컬 접속은 문제 없으나 원격 접속 시 포트 허용 필요

프로젝트 실행:
```bash
# 1) 빌드
docker compose build

# 2) 실행
docker compose up
```

접속:
- 브라우저에서 http://localhost:5173
- 초기 진입 시 `public/hand_4dof.urdf`(5지, 각 4자유도)가 렌더링됩니다.

종료:
```bash
docker compose down
```

캐시 없이 재빌드(문제 발생 시):
```bash
docker compose down
docker compose build --no-cache
docker compose up
```

---

## 수동 실행(로컬 NPM)
Docker 없이 실행하고 싶다면 다음을 사용하세요.

사전 요구 사항:
- Node.js 20.x 권장
- 웹캠

설치 및 실행:
```bash
npm install
npm run dev
```
- 접속: http://localhost:5173

> **참고:** 이 프로젝트는 `@mediapipe/tasks-vision` 패키지를 사용하여 카메라 핸드 트래킹 기능을 제공합니다. `npm install` 실행 시 이 패키지가 함께 설치됩니다.
>
> 주의: 의존성(three/urdf-loader) 호환성으로 인해 Node 버전 또는 패키지 잠금 상태에 따라 결과가 달라질 수 있습니다. 문제 시 Docker 사용을 권장합니다.

---

## 디렉터리 구조
```
hand_webviewer/
├─ public/
│  ├─ hand_4dof.urdf     # 기본 5지/4DOF 핸드 모델
│  └─ default.urdf       # (레거시) 간단 모델
├─ src/
│  ├─ App.tsx            # Three.js + URDF 로더 + 조인트 UI + 핸드 트래킹
│  └─ main.tsx           # 앱 엔트리
├─ index.html            # Vite HTML 템플릿
├─ vite.config.ts        # Vite 서버 설정 (포트 5173)
├─ docker-compose.yml    # Docker Compose 설정 (5173 포트 노출)
├─ Dockerfile            # Node 20-alpine 기반 런타임
├─ package.json
└─ README.md
```

---

## 기술 스택
- UI 프레임워크: React 18 + Vite
- 3D 엔진: Three.js
- URDF 파서/로더: urdf-loader
- 핸드 트래킹: MediaPipe Tasks Vision
- 빌드/실행: Docker + Docker Compose

---

### 🤖 모델 수정 내역

기본 `default.urdf` 핸드 모델이 더 사실적이고 사람 손과 유사한 움직임을 갖도록 크게 개선되었습니다.

*   **엄지손가락:**
    *   **4자유도 움직임:** 이제 엄지손가락은 4자유도를 가집니다. 옆으로 벌리는 움직임(abduction)과 자연스러운 안쪽 굽힘이 모두 가능합니다.
    *   **올바른 초기 방향:** 엄지손가락의 링크(마디)들이 다른 손가락처럼 손등 위가 아닌, 손바닥 옆에서 뻗어 나오도록 초기 방향이 수정되었습니다.
    *   **자연스러운 위치:** 엄지손가락의 시작 위치가 손바닥의 수직 중간 지점으로 이동하여 더 자연스러워졌습니다.

*   **나머지 손가락 (검지, 중지, 약지, 새끼):**
    *   **굽힘 방향 수정:** 네 손가락 모두 엄지손가락 방향, 즉 안쪽으로 굽혀지도록 수정되어 자연스럽게 주먹을 쥘 수 있습니다.
    *   **사실적인 관절 한계:** 관절의 가동 범위가 수정되어, 바깥쪽으로는 비정상적으로 꺾이지 않고 안쪽으로만 90도 이상 굽혀질 수 있습니다.

---

## 사용 방법
1) 페이지 좌측: 3D 뷰어
   - 마우스 좌클릭 드래그: 회전
   - 마우스 휠: 줌 인/아웃
   - 마우스 우클릭 드래그: 팬 이동
2) 페이지 우측: 조인트 슬라이더
   - 로드된 URDF의 joint `limit(lower/upper)` 범위에 맞춰 슬라이더 생성
   - 슬라이더 이동 시 URDF 상 대응 관절이 실시간으로 회전/이동
3) 파일 업로드
   - 상단 파일 선택에서 `.urdf` 텍스트 파일 업로드 시 즉시 로드
   - STL/메시 참조가 있는 URDF는 다음 단계의 ZIP 업로드 기능 추가 후 사용 권장
4) **카메라 핸드 트래킹**
   - 우측 컨트롤 패널에서 **'Camera Capture Mode'** 버튼을 클릭합니다.
   - 브라우저가 카메라 접근 권한을 요청하면 허용합니다.
   - 웹캠 영상이 화면에 나타나고, 인식된 손의 움직임에 따라 3D 모델이 실시간으로 제어됩니다.
   - **'관절 각도 녹화'** 버튼으로 손동작 시퀀스를 녹화하고, **'시퀀스 저장'**으로 파일로 저장할 수 있습니다.
   - **'시퀀스 불러오기'**로 저장된 동작 파일을 다시 재생할 수 있습니다.

---

## 전체 구동 구조
- **프런트엔드(React + Three.js)**
  - Vite 개발 서버(5173)에서 정적 자산 제공(public/)
  - 데이터 흐름
    1. 사용자가 페이지 접속 → 기본 URDF(`/hand_4dof.urdf`) fetch
    2. `urdf-loader`가 URDF 파싱 → 링크/조인트 트리(Object3D) 생성
    3. 조인트 맵(`group.joints`)을 읽어 슬라이더 생성 (limit lower/upper 반영)
    4. 슬라이더 변경 → `group.setJointValue(name, value)` 호출 → 씬 내 관절 갱신
  - **핸드 트래킹 흐름**
    1. 'Camera Capture Mode' 활성화 → MediaPipe HandLandmarker 초기화
    2. 웹캠 스트림에서 프레임마다 손 랜드마크 감지
    3. 감지된 랜드마크 좌표를 이용해 각 손가락 관절의 각도 계산
    4. 계산된 각도를 `setJointValue`를 통해 3D 모델에 실시간 적용
  - 카메라/조작: OrbitControls (회전/줌/팬)

- **Docker 컨테이너**
  - Node 20-alpine 기반 이미지에서 Vite dev 서버 실행 (`--host 0.0.0.0`, 5173 노출)
  - 볼륨: `.:/app` (호스트 파일 변경 시 즉시 반영)
  - 포트: `5173:5173`

- **파일 업로드 플로우**
  - 현재: `.urdf` 텍스트 업로드 → Blob URL로 로더에 전달 → 즉시 렌더
  - 다음 단계(예정): ZIP(URDF + meshes/) 업로드 → 서버에서 압축 해제/가상 경로 매핑 → `package://` 및 상대경로 지원

### 시스템/환경 메모
- 브라우저: WebGL/WEBGL2 지원 필수 (현대적 Firefox/Chrome 권장)
- **카메라**: 핸드 트래킹 기능을 사용하려면 웹캠이 필요합니다.
- 포트: 5173 (필요 시 docker-compose에서 변경 가능)
- 권한: docker 그룹 권한 필요
- 성능 팁: 외장 GPU가 있는 환경에서 원활

---

## 문제 해결 (Troubleshooting)
- **카메라가 작동하지 않을 때**
  - 브라우저 설정에서 사이트의 카메라 접근 권한이 차단되지 않았는지 확인하세요.
  - `https` 환경에서만 카메라 접근이 가능한 경우가 있습니다. 로컬 개발 시 `http://localhost`는 대부분 지원됩니다.
- 브라우저 콘솔에 "URDFLoader: Error parsing file"가 보일 때
  - URDF 문법 오류 또는 로더/Three 버전 호환 문제일 수 있습니다.
  - 기본 제공 `hand_4dof.urdf`로 정상 렌더링되는지 먼저 확인하세요.
- 메시(STL) 참조가 있는 URDF가 로드되지 않을 때
  - 현재 단계에서는 텍스트 URDF의 기본 도형(box 등)만 안정적으로 지원합니다.
  - 다음 단계에서 ZIP 업로드(URDF + meshes/)와 경로 매핑을 추가할 예정입니다.
- 포트 충돌
  - 5173 포트를 사용하는 프로세스 종료 후 다시 시도하거나 docker-compose 포트 매핑을 변경하세요.
- Docker 권한 오류(permission denied to /var/run/docker.sock)
  - `sudo usermod -aG docker $USER` → `newgrp docker` → `docker ps`로 권한 적용 확인

---

## 향후 계획(로드맵)
- URDF+STL ZIP 업로드 지원 및 경로 리매핑(패키지 경로 포함)
- 조인트 프리셋 저장/불러오기
- 머티리얼/라이트 개선, 성능 튜닝(프레임 제한/LOD)
- (선택) rosbridge/WebSocket 연동 → 실제 로봇 제어(JointState/Trajectory 등)
- 모바일 터치 제스처 최적화

---

## 라이선스
- 본 레포지토리의 코드 라이선스는 필요 시 명시 예정입니다. 외부 라이브러리는 각 패키지의 라이선스를 따릅니다.
