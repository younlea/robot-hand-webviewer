import React, { useEffect, useMemo, useRef, useState, useCallback, ChangeEvent } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import URDFLoader from 'urdf-loader';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import {
  HandLandmarker,
  FilesetResolver,
  DrawingUtils
} from '@mediapipe/tasks-vision';

type JointPose = {
  [key: string]: number;
};

type RecordedPose = {
  id: string;
  name:string;
  timestamp: number;
  joints: JointPose;
};

type SequencePose = {
  poseId: string;
  duration: number; // milliseconds
};

type AnimationSequence = {
  id: string;
  name: string;
  poses: SequencePose[];
};

type SequenceBuilderItem = {
  instanceId: string;
  pose: RecordedPose;
};

const STORAGE_KEYS = {
  POSES: 'robot-hand-poses',
  SEQUENCES: 'robot-hand-sequences'
} as const;



const defaultPoses: RecordedPose[] = [

  {

    id: 'default-open',

    name: '기본 열린 손',

    timestamp: Date.now(),

    joints: {

      'thumb_abduction_joint': -0.5,

      'thumb_base_joint': -0.3,

      'thumb_mid_joint': 0.0,

      'thumb_tip_joint': -0.3,

      'index_base_joint': 0.0,

      'index_mid_joint': 0.0,

      'index_tip_joint': 0.0,

      'middle_base_joint': 0.0,

      'middle_mid_joint': 0.0,

      'middle_tip_joint': 0.0,

      'ring_base_joint': 0.0,

      'ring_mid_joint': 0.0,

      'ring_tip_joint': 0.0,

      'pinky_base_joint': 0.0,

      'pinky_mid_joint': 0.0,

      'pinky_tip_joint': 0.0,

    }

  },

  {

    id: 'default-closed',

    name: '기본 닫힌 손',

    timestamp: Date.now(),

    joints: {

      'thumb_abduction_joint': 0,

      'thumb_base_joint': 1.0,

      'thumb_mid_joint': 1.5,

      'thumb_tip_joint': 0.3,

      'index_base_joint': 1.6,

      'index_mid_joint': 1.6,

      'index_tip_joint': 1.6,

      'middle_base_joint': 1.6,

      'middle_mid_joint': 1.6,

      'middle_tip_joint': 1.6,

      'ring_base_joint': 1.6,

      'ring_mid_joint': 1.6,

      'ring_tip_joint': 1.6,

      'pinky_base_joint': 1.6,

      'pinky_mid_joint': 1.6,

      'pinky_tip_joint': 1.6,

    }

  }

];





interface PoseItemProps {

  pose: RecordedPose;

  index: number;

  source: string;

  movePose: (dragIndex: number, hoverIndex: number) => void;

  onDelete: (id: string) => void;

  applyPose: (joints: JointPose) => void;

  onEdit: (pose: RecordedPose) => void;

}

const ItemTypes = {
  POSE: 'pose',
};

const PoseItem: React.FC<PoseItemProps> = ({ pose, index, source, movePose, onDelete, applyPose, onEdit }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [{ handlerId }, drop] = useDrop({
    accept: ItemTypes.POSE,
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
      };
    },
    hover(item: any, monitor) {
      if (!ref.current) {
        return;
      }
      if (item.source !== source) {
        return;
      }
      const dragIndex = item.index;
      const hoverIndex = index;

      if (dragIndex === hoverIndex) {
        return;
      }

      const hoverBoundingRect = ref.current?.getBoundingClientRect();
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;

      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
        return;
      }

      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
        return;
      }

      movePose(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });

  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.POSE,
    item: () => ({ id: pose.id, index, source }),
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  drag(drop(ref));

  return (
    <div
      ref={ref}
      style={{
        padding: '8px',
        marginBottom: '4px',
        backgroundColor: isDragging ? '#e0e0e0' : 'white',
        border: '1px solid #ddd',
        borderRadius: '4px',
        cursor: 'move',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        opacity: isDragging ? 0.5 : 1,
      }}
      data-handler-id={handlerId}
    >
      <span>{pose.name}</span>
      <div>
        <button onClick={() => applyPose(pose.joints)} style={{ marginRight: '4px' }}>적용</button>
        <button onClick={() => onEdit(pose)} style={{ marginRight: '4px' }}>수정</button>
        <button onClick={() => onDelete(pose.id)}>삭제</button>
      </div>
    </div>
  );
};

const CaptureModeView: React.FC<{ onExit: () => void }> = ({ onExit }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recordedJointsRef = useRef<{ timestamp: number; joints: JointPose }[]>([]);
  const [renderer] = useState(() => new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }));
  const [scene] = useState(() => new THREE.Scene());
  const [camera] = useState(() => new THREE.PerspectiveCamera(45, 1, 0.01, 1000));
  const [controls, setControls] = useState<OrbitControls | null>(null);
  const [currentModel, setCurrentModel] = useState<THREE.Object3D | null>(null);
  const [robot, setRobot] = useState<any | null>(null);
  const [joints, setJoints] = useState<{ name: string; min: number; max: number; value: number }[]>([]);
  const handLandmarker = useRef<HandLandmarker | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const [isRecordingJoints, setIsRecordingJoints] = useState(false);
  const isRecordingRef = useRef(isRecordingJoints);
  isRecordingRef.current = isRecordingJoints;

  const applyPose = useCallback((pose: JointPose) => {
    if (!robot) return;

    const poseMap = new Map(Object.entries(pose));

    // Update robot model (side effect)
    for (const [jointName, value] of poseMap.entries()) {
      if (robot.joints[jointName]) {
        (robot as any).setJointValue(jointName, value);
      }
    }

    // Update React state
    setJoints(prevJoints =>
      prevJoints.map(joint => {
        if (poseMap.has(joint.name)) {
          return { ...joint, value: poseMap.get(joint.name)! };
        }
        return joint;
      })
    );
  }, [robot]);

  // 1. 3D 뷰어 초기화
  useEffect(() => {
    if (!mountRef.current) return;

    const mount = mountRef.current;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    camera.position.set(0.6, 0.4, 0.9);
    camera.lookAt(0, 0, 0);

    const orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.target.set(0, 0.1, 0);
    orbitControls.update();
    setControls(orbitControls);

    const resize = () => {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(2, 3, 2);
    scene.add(dir);
    scene.add(new THREE.GridHelper(2, 20));

    const tick = () => {
      animationFrameId.current = requestAnimationFrame(tick);
      orbitControls.update();
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      ro.disconnect();
      orbitControls.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
      scene.clear();
    };
  }, [renderer, scene, camera]);

  // 2. URDF 모델 로드
  const loadDefaultURDF = useCallback(() => {
    if (!scene) return;
    const loader = new URDFLoader();
    loader.load('/default.urdf', (result: any) => {
      const urdf = result;
      urdf.rotation.x = -Math.PI / 2;
      
      if (currentModel) scene.remove(currentModel);

      scene.add(urdf);
      setCurrentModel(urdf);
      setRobot(urdf);
      const jointList = Object.keys(urdf.joints).map(jointName => {
        const joint = urdf.joints[jointName];
        const initialValue = joint.limit.lower;
        urdf.setJointValue(jointName, initialValue);
        return {
          name: jointName,
          min: joint.limit.lower,
          max: joint.limit.upper,
          value: initialValue,
        };
      });
      setJoints(jointList);
    });
  }, [scene, currentModel]);

  useEffect(() => {
    if (scene && !currentModel) {
      loadDefaultURDF();
    }
  }, [scene, currentModel, loadDefaultURDF]);

  const calculateJointAngles = (landmarks: any[]): JointPose => {
    const jointPose: JointPose = {};
  
    const getAngle = (p1: any, p2: any, p3: any) => {
      const v1 = { x: p1.x - p2.x, y: p1.y - p2.y, z: p1.z - p2.z };
      const v2 = { x: p3.x - p2.x, y: p3.y - p2.y, z: p3.z - p2.z };
      const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
      const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
      const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);
      const angle = Math.acos(dot / (mag1 * mag2));
      return angle;
    };
  
    if (landmarks && landmarks.length > 0) {
      const l = landmarks[0];
  
      // Index finger
      jointPose['index_base_joint'] = Math.max(0, Math.PI - getAngle(l[0], l[5], l[6]));
      jointPose['index_mid_joint'] = Math.max(0, Math.PI - getAngle(l[5], l[6], l[7]));
      jointPose['index_tip_joint'] = Math.max(0, Math.PI - getAngle(l[6], l[7], l[8]));
  
      // Middle finger
      jointPose['middle_base_joint'] = Math.max(0, Math.PI - getAngle(l[0], l[9], l[10]));
      jointPose['middle_mid_joint'] = Math.max(0, Math.PI - getAngle(l[9], l[10], l[11]));
      jointPose['middle_tip_joint'] = Math.max(0, Math.PI - getAngle(l[10], l[11], l[12]));
  
      // Ring finger
      jointPose['ring_base_joint'] = Math.max(0, Math.PI - getAngle(l[0], l[13], l[14]));
      jointPose['ring_mid_joint'] = Math.max(0, Math.PI - getAngle(l[13], l[14], l[15]));
      jointPose['ring_tip_joint'] = Math.max(0, Math.PI - getAngle(l[14], l[15], l[16]));
  
      // Pinky finger
      jointPose['pinky_base_joint'] = Math.max(0, Math.PI - getAngle(l[0], l[17], l[18]));
      jointPose['pinky_mid_joint'] = Math.max(0, Math.PI - getAngle(l[17], l[18], l[19]));
      jointPose['pinky_tip_joint'] = Math.max(0, Math.PI - getAngle(l[18], l[19], l[20]));
  
      // Thumb
      jointPose['thumb_abduction_joint'] = Math.max(0, getAngle(l[2], l[1], l[0]) - 0.8);
      jointPose['thumb_base_joint'] = Math.max(0, Math.PI - getAngle(l[1], l[2], l[3]));
      jointPose['thumb_mid_joint'] = Math.max(0, Math.PI - getAngle(l[2], l[3], l[4]));
      jointPose['thumb_tip_joint'] = Math.max(0, Math.PI - getAngle(l[3], l[4], l[4])); // Placeholder
    }
  
    return jointPose;
  };

  // 3. MediaPipe HandLandmarker 초기화 및 웹캠 시작
  useEffect(() => {
    let localHandLandmarker: HandLandmarker | null = null;
    let animationFrameId: number | null = null;

    const createHandLandmarker = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        localHandLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1
        });
        handLandmarker.current = localHandLandmarker;
        console.log("HandLandmarker created");
        startWebcam();
      } catch (e) {
        console.error("Failed to create HandLandmarker", e);
      }
    };

    const startWebcam = () => {
      if (!handLandmarker.current) {
        console.log("HandLandmarker not ready yet");
        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const message = "카메라에 접근할 수 없습니다. 이 기능은 보안 연결(HTTPS) 또는 localhost에서만 작동합니다.";
        console.error(message);
        alert(message);
        return;
      }

      navigator.mediaDevices.getUserMedia({ video: true })
        .then((stream) => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.addEventListener('loadeddata', () => {
              if (videoRef.current && canvasRef.current) {
                canvasRef.current.width = videoRef.current.videoWidth;
                canvasRef.current.height = videoRef.current.videoHeight;
              }
              predictWebcam();
            });
          }
        })
        .catch((err) => {
          console.error("Error accessing webcam: ", err);
        });
    };

    const predictWebcam = () => {
      if (!videoRef.current || !canvasRef.current || !handLandmarker.current) {
        animationFrameId = requestAnimationFrame(predictWebcam);
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const canvasCtx = canvas.getContext("2d");

      if (video.readyState < 2) {
        animationFrameId = requestAnimationFrame(predictWebcam);
        return;
      }

      if (!canvasCtx) {
        return;
      }

      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

      const results = handLandmarker.current.detectForVideo(video, performance.now());

      const drawingUtils = new DrawingUtils(canvasCtx);

      if (results.landmarks) {
        for (const landmarks of results.landmarks) {
          drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, { color: "#00FF00", lineWidth: 5 });
          drawingUtils.drawLandmarks(landmarks, { color: "#FF0000", lineWidth: 2 });
        }
        const jointPose = calculateJointAngles(results.landmarks);
        applyPose(jointPose);
        if (isRecordingRef.current) {
          try {
            recordedJointsRef.current.push({ timestamp: Date.now(), joints: jointPose });
          } catch (e) {
            console.error("Error while recording joint data:", e);
          }
        }
      }
      canvasCtx.restore();

      animationFrameId = requestAnimationFrame(predictWebcam);
    };

    createHandLandmarker();

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
      if(localHandLandmarker) {
        localHandLandmarker.close();
      }
    }
  }, [applyPose]);

  const takeSnapshot = () => {
    if (!renderer || !videoRef.current || !canvasRef.current) return;
  
    const threeCanvas = renderer.domElement;
    const video = videoRef.current;
    const landmarksCanvas = canvasRef.current;
  
    const compositeCanvas = document.createElement('canvas');
    const ctx = compositeCanvas.getContext('2d');
    if (!ctx) return;
  
    const targetWidth = 1280;
    const targetHeight = 720;
    compositeCanvas.width = targetWidth * 2;
    compositeCanvas.height = targetHeight;
  
    // Draw 3D view
    ctx.drawImage(threeCanvas, 0, 0, targetWidth, targetHeight);
  
    // Draw webcam view (flipped)
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -targetWidth * 2, 0, targetWidth, targetHeight);
    ctx.restore();
  
    // Draw landmarks (flipped)
    ctx.save();
    ctx.translate(targetWidth, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(landmarksCanvas, 0, 0, targetWidth, targetHeight);
    ctx.restore();
  
    const a = document.createElement('a');
    a.href = compositeCanvas.toDataURL('image/png');
    a.download = `snapshot-${new Date().toISOString()}.png`;
    a.click();
  };

  const saveCurrentPose = () => {
    const currentJointsState: JointPose = {};
    joints.forEach(j => {
      currentJointsState[j.name] = j.value;
    });

    const poseName = prompt("저장할 포즈의 이름을 입력하세요:", `캡쳐 ${new Date().toLocaleTimeString()}`);
    if (!poseName) return;

    const newPose: RecordedPose = {
      id: `pose-${Date.now()}`,
      name: poseName,
      timestamp: Date.now(),
      joints: currentJointsState,
    };

    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem(STORAGE_KEYS.POSES);
        const existingPoses = saved ? JSON.parse(saved) : [];
        const newPoses = [...existingPoses, newPose];
        localStorage.setItem(STORAGE_KEYS.POSES, JSON.stringify(newPoses));
        alert(`포즈 '${poseName}'이(가) 저장되었습니다. 돌아가기 버튼을 누르면 목록에서 확인할 수 있습니다.`);
      }
    } catch (error) {
      console.error('Error saving to local storage:', error);
      alert('포즈 저장에 실패했습니다.');
    }
  };

  const toggleJointRecording = () => {
    if (isRecordingJoints) {
      // Stop recording
      setIsRecordingJoints(false);
      const recording = recordedJointsRef.current;
      recordedJointsRef.current = [];

      if (recording.length < 2) {
        alert("녹화 시간이 너무 짧습니다.");
        return;
      }

      const sequenceName = prompt("저장할 시퀀스의 이름을 입력하세요:", `녹화 ${new Date().toLocaleTimeString()}`);
      if (!sequenceName) return;

      try {
        // 1. Get existing poses and sequences from localStorage
        const savedPosesStr = localStorage.getItem(STORAGE_KEYS.POSES) || '[]';
        const savedSequencesStr = localStorage.getItem(STORAGE_KEYS.SEQUENCES) || '[]';
        let existingPoses: RecordedPose[] = JSON.parse(savedPosesStr);
        let existingSequences: AnimationSequence[] = JSON.parse(savedSequencesStr);

        // 2. Sample the recording to create new poses
        const newPoses: RecordedPose[] = [];
        const newSequencePoses: SequencePose[] = [];
        const sampleInterval = 1000; // 1 pose per second
        let lastSampleTime = -Infinity;

        for (const frame of recording) {
          if (frame.timestamp - lastSampleTime >= sampleInterval) {
            const newPoseId = `pose-${frame.timestamp}-${Math.random().toString(16).slice(2)}`;
            const newPose: RecordedPose = {
              id: newPoseId,
              name: `${sequenceName} #${newPoses.length + 1}`,
              timestamp: frame.timestamp,
              joints: frame.joints,
            };
            newPoses.push(newPose);
            newSequencePoses.push({ poseId: newPoseId, duration: sampleInterval });
            lastSampleTime = frame.timestamp;
          }
        }
        
        if (newSequencePoses.length > 1) {
            const lastPoseTime = newPoses[newPoses.length - 1].timestamp;
            const remainingTime = recording[recording.length - 1].timestamp - lastPoseTime;
            if (remainingTime > 100) {
                 newSequencePoses[newSequencePoses.length - 2].duration = lastPoseTime - newPoses[newPoses.length - 2].timestamp;
                 newSequencePoses[newSequencePoses.length - 1].duration = remainingTime;
            }
        }

        if (newPoses.length < 2) {
            alert("의미있는 포즈를 생성하기에 녹화 시간이 너무 짧습니다.");
            return;
        }

        // 3. Create the new sequence
        const newSequence: AnimationSequence = {
          id: `seq-${Date.now()}`,
          name: sequenceName,
          poses: newSequencePoses,
        };

        // 4. Save back to localStorage
        const updatedPoses = [...existingPoses, ...newPoses];
        const updatedSequences = [...existingSequences, newSequence];
        localStorage.setItem(STORAGE_KEYS.POSES, JSON.stringify(updatedPoses));
        localStorage.setItem(STORAGE_KEYS.SEQUENCES, JSON.stringify(updatedSequences));

        alert(`시퀀스 '${sequenceName}'이(가) 저장되었습니다. 돌아가기 버튼을 누르면 목록에서 확인할 수 있습니다.`);

      } catch (error) {
        console.error('Error saving sequence:', error);
        alert('시퀀스 저장에 실패했습니다.');
      }

    } else {
      // Start recording
      recordedJointsRef.current = [];
      setIsRecordingJoints(true);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', height: '100vh' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'relative' }} />
      <div style={{ padding: 12, overflow: 'auto', borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flexShrink: 0, marginBottom: '12px' }}>
          <button onClick={onExit} style={{ padding: '8px 16px', marginBottom: '12px' }}>돌아가기</button>
          <h2>카메라 캡쳐 모드</h2>
        </div>
        <div style={{ position: 'relative', flexGrow: 1 }}>
          <video ref={videoRef} autoPlay playsInline style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', zIndex: 1 }} />
          <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', transform: 'scaleX(-1)', zIndex: 2 }} />
        </div>
        <div style={{ flexShrink: 0, padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '4px', marginTop: '12px' }}>
          <h4 style={{ marginTop: 0 }}>컨트롤</h4>
          <button onClick={takeSnapshot}>이미지 스냅샷</button>
          <button onClick={saveCurrentPose} style={{ marginLeft: '8px' }}>관절각도 저장</button>
          <button onClick={toggleJointRecording} style={{ marginLeft: '8px' }}>
            {isRecordingJoints ? '녹화 중지' : '관절 각도 녹화'}
          </button>
        </div>
      </div>
    </div>
  );
};

const AppContent: React.FC<{ onEnterCaptureMode: () => void }> = ({ onEnterCaptureMode }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [renderer] = useState(() => new THREE.WebGLRenderer({ antialias: true }));
  const [scene] = useState(() => new THREE.Scene());
  const [camera] = useState(() => new THREE.PerspectiveCamera(45, 1, 0.01, 1000));
  const [controls, setControls] = useState<OrbitControls | null>(null);
  const [currentModel, setCurrentModel] = useState<THREE.Object3D | null>(null);

  useEffect(() => {
    if (!mountRef.current) return

    const mount = mountRef.current
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    mount.appendChild(renderer.domElement)

    camera.position.set(0.6, 0.4, 0.9)
    camera.lookAt(0, 0, 0)

    const orbitControls = new OrbitControls(camera, renderer.domElement)
    orbitControls.enableDamping = true
    orbitControls.dampingFactor = 0.05
    orbitControls.target.set(0, 0.1, 0)
    
    orbitControls.enableZoom = true
    orbitControls.zoomSpeed = 1.5
    orbitControls.minDistance = 0.2
    orbitControls.maxDistance = 3.0
    
    orbitControls.enablePan = false
    
    orbitControls.update()
    setControls(orbitControls)

    const resize = () => {
      if (!mount) return
      const w = mount.clientWidth
      const h = mount.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(mount)

    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const dir = new THREE.DirectionalLight(0xffffff, 0.8)
    dir.position.set(2, 3, 2)
    scene.add(dir)

    const grid = new THREE.GridHelper(2, 20)
    scene.add(grid)

    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      orbitControls.update()
      renderer.render(scene, camera)
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      orbitControls.dispose()
      mount.removeChild(renderer.domElement)
      scene.clear()
    }
  }, [renderer, scene, camera])
  
  const [robot, setRobot] = useState<any | null>(null);
  const [joints, setJoints] = useState<{ name: string; min: number; max: number; value: number }[]>([]);
  
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [editingPose, setEditingPose] = useState<RecordedPose | null>(null);
  const [editedPoseName, setEditedPoseName] = useState('');
  const [editedJoints, setEditedJoints] = useState<JointPose>({});
  const [recordedPoses, setRecordedPoses] = useState<RecordedPose[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEYS.POSES);
      return saved ? JSON.parse(saved) : [...defaultPoses];
    }
    return [...defaultPoses];
  });
  const [sequences, setSequences] = useState<AnimationSequence[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEYS.SEQUENCES);
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [poseName, setPoseName] = useState('');
  const [currentSequence, setCurrentSequence] = useState<AnimationSequence | null>(null);
  const [sequenceName, setSequenceName] = useState('');
  const [sequenceBuilderPoses, setSequenceBuilderPoses] = useState<SequenceBuilderItem[]>([]);
  const poseFileInputRef = useRef<HTMLInputElement>(null);
  const sequenceFileInputRef = useRef<HTMLInputElement>(null);
  const animationRef = useRef<number | null>(null);

  const saveToLocalStorage = useCallback((key: string, data: any) => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(data));
      }
    } catch (error) {
      console.error('로컬 스토리지 저장 오류:', error);
    }
  }, []);

  const loadDefaultURDF = useCallback(() => {
    if (!scene) return;
    const loader = new URDFLoader();
    loader.load('/default.urdf', (result: any) => {
      const urdf = result;
      urdf.rotation.x = -Math.PI / 2;
      
      if (currentModel) {
        scene.remove(currentModel);
      }

      scene.add(urdf);
      setCurrentModel(urdf);
      setRobot(urdf);
      const jointList = Object.keys(urdf.joints)
        .map(jointName => {
          const joint = urdf.joints[jointName];
          const initialValue = joint.limit.lower;
          urdf.setJointValue(jointName, initialValue);
          return {
            name: jointName,
            min: joint.limit.lower,
            max: joint.limit.upper,
            value: initialValue,
          };
        });
      setJoints(jointList);
    });
  }, [scene, currentModel]);

  useEffect(() => {
    if (scene && !currentModel) {
      loadDefaultURDF();
    }
  }, [scene, currentModel, loadDefaultURDF]);

  const addPose = useCallback(() => {
    if (!robot) return;
    const newPose: RecordedPose = {
      id: `pose-${Date.now()}`,
      name: poseName || `Pose ${recordedPoses.length + 1}`,
      timestamp: Date.now(),
      joints: {},
    };
    joints.forEach(j => {
      newPose.joints[j.name] = j.value;
    });
    const newPoses = [...recordedPoses, newPose];
    setRecordedPoses(newPoses);
    saveToLocalStorage(STORAGE_KEYS.POSES, newPoses);
    setPoseName('');
  }, [robot, joints, poseName, recordedPoses, saveToLocalStorage]);

  const applyPose = useCallback((pose: JointPose) => {
    if (!robot) return;

    const poseMap = new Map(Object.entries(pose));

    const newJointsState = joints.map(joint => {
      if (poseMap.has(joint.name)) {
        const newValue = poseMap.get(joint.name)!;
        (robot as any).setJointValue(joint.name, newValue);
        return { ...joint, value: newValue };
      }
      return joint;
    });

    setJoints(newJointsState);
  }, [robot, joints]);

  const onChangeJoint = useCallback((name: string, value: number) => {
    if (!robot) return;
    
    (robot as any).setJointValue(name, value);
    
    setJoints(prev => 
      prev.map(j => (j.name === name ? { ...j, value } : j))
    );
  }, [robot]);

  const startEditingPose = useCallback((pose: RecordedPose) => {
    setEditingPose(pose);
    setEditedPoseName(pose.name);
    setEditedJoints({ ...pose.joints });
  }, []);

  const saveEditedPose = useCallback(() => {
    if (!editingPose) return;
  
    setRecordedPoses(prev => {
      const updatedPoses = prev.map(pose => {
        if (pose.id === editingPose.id) {
          return {
            ...pose,
            name: editedPoseName,
            joints: { ...editedJoints },
            timestamp: Date.now()
          };
        }
        return pose;
      });
      
      saveToLocalStorage(STORAGE_KEYS.POSES, updatedPoses);
      return updatedPoses;
    });
    
    setEditingPose(null);
  }, [editingPose, editedPoseName, editedJoints, saveToLocalStorage]);

  const cancelEditing = useCallback(() => {
    setEditingPose(null);
  }, []);

  const updateEditedJoint = useCallback((jointName: string, value: number) => {
    setEditedJoints(prev => ({
      ...prev,
      [jointName]: value
    }));
    onChangeJoint(jointName, value);
  }, [onChangeJoint]);

  const savePoses = useCallback((poses: RecordedPose[]) => {
    setRecordedPoses(poses);
    saveToLocalStorage(STORAGE_KEYS.POSES, poses);
  }, [saveToLocalStorage]);

  const saveSequences = useCallback((seqs: AnimationSequence[]) => {
    setSequences(seqs);
    saveToLocalStorage(STORAGE_KEYS.SEQUENCES, seqs);
  }, [saveToLocalStorage]);

  const onLoadStlFile = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !scene) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const contents = e.target?.result as ArrayBuffer;
        const loader = new STLLoader();
        const geometry = loader.parse(contents);
        
        const material = new THREE.MeshStandardMaterial({ color: 0x999999 });
        const mesh = new THREE.Mesh(geometry, material);

        if (currentModel) {
            scene.remove(currentModel);
        }
        setRobot(null);
        setJoints([]);

        scene.add(mesh);
        setCurrentModel(mesh);

        const box = new THREE.Box3().setFromObject(mesh);
        const center = box.getCenter(new THREE.Vector3());
        controls?.target.copy(center);
        controls?.update();
    };
    reader.readAsArrayBuffer(file);
    if (event.target) {
        event.target.value = '';
    }
  }, [scene, currentModel, controls]);

  const onLoadUrdfFile = useCallback((event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !scene) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const urdfContent = e.target?.result as string;
        const loader = new URDFLoader();
        const newRobot = loader.parse(urdfContent);
        newRobot.rotation.x = -Math.PI / 2;
        
        if (currentModel) {
          scene.remove(currentModel);
        }

        scene.add(newRobot);
        setCurrentModel(newRobot);
        setRobot(newRobot);
        const jointList = Object.keys(newRobot.joints).map(jointName => {
          const joint = newRobot.joints[jointName];
          return {
            name: jointName,
            min: joint.limit.lower,
            max: joint.limit.upper,
            value: 0,
          };
        });
        setJoints(jointList);
      };
      reader.readAsText(file);
      if (event.target) {
        event.target.value = '';
      }
    }, [scene, currentModel]);

  const exportToFile = (data: any, filename: string) => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importFromFile = (event: ChangeEvent<HTMLInputElement>, callback: (data: any) => void) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        callback(data);
      } catch (error) {
        alert('Error parsing JSON file.');
      }
    };
    reader.readAsText(file);
    if (event.target) {
      event.target.value = '';
    }
  };

  const exportPoses = useCallback(() => {
    exportToFile(recordedPoses, `robot-hand-poses-${new Date().toISOString().split('T')[0]}.json`);
  }, [recordedPoses]);

  const exportSequences = useCallback(() => {
    if (sequences.length === 0) {
      alert("내보낼 시퀀스가 없습니다.");
      return;
    }
    // Find all unique pose IDs used in the sequences
    const allPoseIds = new Set<string>();
    sequences.forEach(seq => {
      seq.poses.forEach(p => allPoseIds.add(p.poseId));
    });

    // Get the actual pose data for those IDs
    const requiredPoses = recordedPoses.filter(p => allPoseIds.has(p.id));

    const exportData = {
      type: 'robot-hand-sequence-bundle',
      version: 1,
      sequences: sequences,
      poses: requiredPoses,
    };

    exportToFile(exportData, `sequences-bundle-${new Date().toISOString().split('T')[0]}.json`);
  }, [sequences, recordedPoses]);

  const importPoses = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    importFromFile(event, (data) => {
      if (Array.isArray(data) && data.every(pose => pose.id && pose.name && pose.joints)) {
        setRecordedPoses(data);
        savePoses(data);
        alert(`${data.length}개의 포즈를 성공적으로 가져왔습니다.`);
      } else {
        alert('잘못된 포즈 데이터 형식입니다.');
      }
    });
  }, [importFromFile, savePoses]);

  const importSequences = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    importFromFile(event, (data) => {
      // New bundled format check
      if (data && data.type === 'robot-hand-sequence-bundle' && data.version === 1 && Array.isArray(data.sequences) && Array.isArray(data.poses)) {
        const importedSequences: AnimationSequence[] = data.sequences;
        const importedPoses: RecordedPose[] = data.poses;

        // Merge poses: Add new, don't overwrite existing by ID
        const existingPosesMap = new Map(recordedPoses.map(p => [p.id, p]));
        const newPosesToAdd = importedPoses.filter(p => !existingPosesMap.has(p.id));
        
        // Merge sequences: Add new, don't overwrite existing by ID
        const existingSequencesMap = new Map(sequences.map(s => [s.id, s]));
        const newSequencesToAdd = importedSequences.filter(s => !existingSequencesMap.has(s.id));

        if (newPosesToAdd.length === 0 && newSequencesToAdd.length === 0) {
          alert("이미 모든 시퀀스와 포즈가 존재합니다.");
          return;
        }

        const updatedPoses = [...recordedPoses, ...newPosesToAdd];
        savePoses(updatedPoses);

        const updatedSequences = [...sequences, ...newSequencesToAdd];
        saveSequences(updatedSequences);
        
        alert(`${newSequencesToAdd.length}개의 신규 시퀀스와 ${newPosesToAdd.length}개의 신규 포즈를 성공적으로 가져왔습니다.`);
        return; // Exit after successful import
      }
      
      // Lenient legacy format check (array of sequences or single sequence object)
      let sequencesToImport: AnimationSequence[] = [];
      if (Array.isArray(data)) {
        sequencesToImport = data.filter(
          seq => seq && typeof seq === 'object' && seq.id && seq.name && Array.isArray(seq.poses)
        );
      } else if (data && typeof data === 'object' && !Array.isArray(data) && data.id && data.name && Array.isArray(data.poses)) {
        // Handle case where a single sequence object was exported
        sequencesToImport.push(data as AnimationSequence);
      }

      if (sequencesToImport.length > 0) {
        alert('레거시 시퀀스 파일 형식입니다. 이 시퀀스와 연관된 포즈가 목록에 없으면 제대로 작동하지 않을 수 있습니다.');
        
        const existingSequencesMap = new Map(sequences.map(s => [s.id, s]));
        const newSequencesToAdd = sequencesToImport.filter(s => !existingSequencesMap.has(s.id));

        if (newSequencesToAdd.length === 0) {
          alert("가져온 파일의 모든 시퀀스가 이미 존재합니다.");
          return;
        }

        const updatedSequences = [...sequences, ...newSequencesToAdd];
        saveSequences(updatedSequences);
        
        alert(`${newSequencesToAdd.length}개의 신규 시퀀스를 성공적으로 가져왔습니다.`);
      } else {
        alert('지원되지 않거나 잘못된 시퀀스 파일 형식입니다.');
      }
    });
  }, [importFromFile, saveSequences, savePoses, recordedPoses, sequences]);

  const deg = (rad: number) => (rad * 180) / Math.PI;

  const movePose = useCallback((dragIndex: number, hoverIndex: number) => {
    setRecordedPoses((prevPoses) => {
      const newPoses = [...prevPoses];
      const [removed] = newPoses.splice(dragIndex, 1);
      newPoses.splice(hoverIndex, 0, removed);
      savePoses(newPoses);
      return newPoses;
    });
  }, [savePoses]);

  const moveSequenceBuilderPose = useCallback((dragIndex: number, hoverIndex: number) => {
    setSequenceBuilderPoses((prevPoses) => {
      const newPoses = [...prevPoses];
      const [removed] = newPoses.splice(dragIndex, 1);
      newPoses.splice(hoverIndex, 0, removed);
      return newPoses;
    });
  }, []);

  const [{ isOver, canDrop }, dropRef] = useDrop(() => ({
    accept: ItemTypes.POSE,
    drop: (item: { id: string, index: number, source: string }) => {
      if (item.source === 'builder') {
        return;
      }
      const droppedPose = recordedPoses.find(p => p.id === item.id);
      if (droppedPose) {
        const newInstance: SequenceBuilderItem = {
          instanceId: `instance-${Date.now()}-${Math.random()}`,
          pose: droppedPose,
        };
        setSequenceBuilderPoses(current => [...current, newInstance]);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  }), [recordedPoses]);

  const stopPlayback = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    setIsPlaying(false);
    setCurrentSequence(null);
  }, []);

  const playSequence = useCallback((sequence: AnimationSequence) => {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    if (sequence.poses.length < 2) {
      console.warn("Sequence needs at least two poses to play.");
      return;
    }

    setIsPlaying(true);
    setCurrentSequence(sequence);

    let currentPoseIndex = 0;
    let startTime = 0;
    let fromJoints: JointPose | null = null;

    const animate = (time: number) => {
      if (startTime === 0) {
        startTime = time;
        const firstPoseData = recordedPoses.find(p => p.id === sequence.poses[0].poseId);
        if (firstPoseData) {
          applyPose(firstPoseData.joints);
          fromJoints = firstPoseData.joints;
        }
      }

      const seqPose = sequence.poses[currentPoseIndex];
      const nextSeqPose = sequence.poses[currentPoseIndex + 1];

      if (!nextSeqPose) {
        stopPlayback();
        return;
      }

      const startPoseData = fromJoints ? { joints: fromJoints } : recordedPoses.find(p => p.id === seqPose.poseId);
      const endPoseData = recordedPoses.find(p => p.id === nextSeqPose.poseId);
      
      if (!startPoseData || !endPoseData) {
        console.error("Could not find poses for sequence animation.");
        stopPlayback();
        return;
      }

      const duration = seqPose.duration / playbackSpeed;
      const elapsedTime = time - startTime;
      const alpha = Math.min(elapsedTime / duration, 1.0);

      const interpolatedJoints: JointPose = {};
      for (const jointName in endPoseData.joints) {
        const startValue = startPoseData.joints[jointName] ?? 0;
        const endValue = endPoseData.joints[jointName] ?? 0;
        interpolatedJoints[jointName] = THREE.MathUtils.lerp(startValue, endValue, alpha);
      }
      applyPose(interpolatedJoints);

      if (alpha >= 1.0) {
        currentPoseIndex++;
        startTime = time;
        fromJoints = endPoseData.joints;
        if (currentPoseIndex >= sequence.poses.length - 1) {
          applyPose(endPoseData.joints);
          stopPlayback();
          return;
        }
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
  }, [isPlaying, stopPlayback, recordedPoses, applyPose, playbackSpeed]);

  const createSequence = useCallback(() => {
    if (!sequenceName.trim() || sequenceBuilderPoses.length < 2) return;

    const newSequence: AnimationSequence = {
      id: `seq-${Date.now()}`,
      name: sequenceName.trim(),
      poses: sequenceBuilderPoses.map(item => ({ poseId: item.pose.id, duration: 1000 })),
    };

    const newSequences = [...sequences, newSequence];
    setSequences(newSequences);
    saveToLocalStorage(STORAGE_KEYS.SEQUENCES, newSequences);
    setSequenceName('');
    setSequenceBuilderPoses([]); // Clear the builder
  }, [sequenceName, sequenceBuilderPoses, sequences, saveToLocalStorage]);

  const deleteSequence = useCallback((id: string) => {
    const newSequences = sequences.filter(seq => seq.id !== id);
    setSequences(newSequences);
    saveToLocalStorage(STORAGE_KEYS.SEQUENCES, newSequences);
  }, [sequences, saveToLocalStorage]);

  const updatePoseDuration = useCallback((sequenceId: string, poseIndex: number, duration: number) => {
    const newSequences = sequences.map(seq => {
      if (seq.id === sequenceId) {
        const newPoses = [...seq.poses];
        newPoses[poseIndex].duration = duration;
        return { ...seq, poses: newPoses };
      }
      return seq;
    });
    setSequences(newSequences);
    saveToLocalStorage(STORAGE_KEYS.SEQUENCES, newSequences);
  }, [sequences, saveToLocalStorage]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', height: '100vh' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      <div style={{ padding: 12, overflow: 'auto', borderLeft: '1px solid #e5e7eb' }}>
        <div style={{ margin: '16px 0', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
            <button 
              onClick={onEnterCaptureMode}
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: '#1d4ed8',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 'bold'
              }}
            >
              카메라 모델 캡쳐
            </button>
        </div>
        <h3 style={{ marginTop: 0 }}>모델 로드</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ flexBasis: '50px' }}>URDF:</span>
            <input type="file" accept=".urdf, text/xml, application/xml" onChange={onLoadUrdfFile} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ flexBasis: '50px' }}>STL:</span>
            <input type="file" accept=".stl" onChange={onLoadStlFile} />
          </div>
        </div>
        
        <div style={{ margin: '16px 0', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
          <h4 style={{ marginTop: 0, marginBottom: '12px' }}>레코딩 컨트롤</h4>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <button 
              onClick={() => setIsRecording(!isRecording)}
              style={{
                flex: 1,
                padding: '8px',
                backgroundColor: isRecording ? '#ef4444' : '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {isRecording ? '레코딩 중지' : '레코딩 시작'}
            </button>
            <button 
              onClick={addPose}
              disabled={!isRecording || !robot}
              style={{
                flex: 1,
                padding: '8px',
                backgroundColor: (isRecording && robot) ? '#3b82f6' : '#d1d5db',
                color: (isRecording && robot) ? 'white' : '#6b7280',
                border: 'none',
                borderRadius: '4px',
                cursor: (isRecording && robot) ? 'pointer' : 'not-allowed',
                opacity: (isRecording && robot) ? 1 : 0.7
              }}
            >
              포즈 추가
            </button>
          </div>
          <input
            type="text"
            value={poseName}
            onChange={(e) => setPoseName(e.target.value)}
            placeholder="포즈 이름 (선택사항)"
            style={{
              width: '100%',
              padding: '8px',
              marginBottom: '8px',
              border: '1px solid #d1d5db',
              borderRadius: '4px'
            }}
            disabled={!isRecording || !robot}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px' }}>속도:</span>
              <input
                type="range"
                min="0.1"
                max="3"
                step="0.1"
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: '12px', minWidth: '30px' }}>{playbackSpeed.toFixed(1)}x</span>
            </div>
          </div>
          <div style={{ marginTop: '10px' }}>
            <button onClick={exportPoses} disabled={!recordedPoses.length}>포즈 내보내기</button>
            <label style={{ marginLeft: '10px', display: 'inline-block' }}>
              <button onClick={() => poseFileInputRef.current?.click()}>포즈 가져오기</button>
              <input
                type="file"
                ref={poseFileInputRef}
                onChange={importPoses}
                accept=".json"
                style={{ display: 'none' }}
              />
            </label>
          </div>
        </div>
        
        {editingPose ? (
          <div style={{ margin: '16px 0', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
            <h4 style={{ marginTop: 0, marginBottom: '12px' }}>포즈 편집</h4>
            <div style={{ marginBottom: '12px' }}>
              <input
                type="text"
                value={editedPoseName}
                onChange={(e) => setEditedPoseName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  marginBottom: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px'
                }}
                placeholder="포즈 이름"
              />
              {joints.length > 0 && (
                <div>
                  {joints.map(joint => (
                    <div key={joint.name} style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '0.9rem' }}>{joint.name}</span>
                        <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                          {editedJoints[joint.name]?.toFixed(2) || '0.00'}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={joint.min}
                        max={joint.max}
                        step={Math.abs(joint.max - joint.min) / 100 || 0.01}
                        value={editedJoints[joint.name] || 0}
                        onChange={(e) => updateEditedJoint(joint.name, parseFloat(e.target.value))}
                        style={{ width: '100%' }}
                      />
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <button
                  onClick={saveEditedPose}
                  style={{
                    flex: 1,
                    padding: '8px',
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  저장
                </button>
                <button
                    onClick={cancelEditing}
                    style={{
                      flex: 1,
                      padding: '8px',
                      backgroundColor: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    취소
                  </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ margin: '16px 0', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
            <h4 style={{ marginTop: 0, marginBottom: '12px' }}>저장된 포즈 목록</h4>
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {recordedPoses.map((p, i) => (
                <PoseItem
                  key={p.id}
                  pose={p}
                  index={i}
                  source="main"
                  onDelete={(id) => {
                    const newPoses = recordedPoses.filter(pose => pose.id !== id);
                    setRecordedPoses(newPoses);
                    saveToLocalStorage(STORAGE_KEYS.POSES, newPoses);
                  }}
                  movePose={movePose}
                  applyPose={applyPose}
                  onEdit={startEditingPose}
                />
              ))}
            </div>
            <button 
              onClick={() => {
                if (window.confirm('모든 포즈를 삭제하시겠습니까?')) {
                  setRecordedPoses([]);
                  saveToLocalStorage(STORAGE_KEYS.POSES, []);
                }
              }}
              disabled={recordedPoses.length === 0}
              style={{
                width: '100%',
                marginTop: '10px',
                padding: '6px',
                backgroundColor: recordedPoses.length > 0 ? '#ef4444' : '#d1d5db',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: recordedPoses.length > 0 ? 'pointer' : 'not-allowed',
                opacity: recordedPoses.length > 0 ? 1 : 0.7,
                fontSize: '12px'
              }}
            >
              모든 포즈 삭제
            </button>
          </div>
        )}
        
        {/* 시퀀스 관리 섹션 */}
        <div style={{ margin: '16px 0', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
          <h4 style={{ marginTop: 0, marginBottom: '12px' }}>시퀀스 생성기</h4>

          <div ref={dropRef} style={{ marginBottom: '12px', padding: '12px', border: `2px dashed ${isOver ? (canDrop ? 'green' : 'red') : '#9ca3af'}`, borderRadius: '4px', backgroundColor: isOver && canDrop ? '#e6ffed' : '#f9fafb', transition: 'background-color 0.2s, border-color 0.2s' }}>
            <p style={{ marginTop: 0, color: '#6b7280', textAlign: 'center', fontSize: '14px' }}>
              위의 '저장된 포즈 목록'에서 포즈를 여기로 드래그하여 시퀀스를 만드세요.
            </p>
            <div style={{ minHeight: '60px', maxHeight: '250px', overflowY: 'auto' }}>
              {sequenceBuilderPoses.map((item, i) => (
                <PoseItem
                  key={item.instanceId}
                  pose={item.pose}
                  index={i}
                  source="builder"
                  onDelete={() => {
                    setSequenceBuilderPoses(prev => prev.filter(p => p.instanceId !== item.instanceId));
                  }}
                  movePose={moveSequenceBuilderPose}
                  applyPose={applyPose}
                  onEdit={startEditingPose}
                />
              ))}
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <input
              type="text"
              value={sequenceName}
              onChange={(e) => setSequenceName(e.target.value)}
              placeholder="시퀀스 이름"
              style={{
                flex: 1,
                padding: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '4px'
              }}
            />
            <button 
              onClick={createSequence}
              disabled={sequenceBuilderPoses.length < 2 || !sequenceName.trim()}
              style={{
                padding: '8px 16px',
                backgroundColor: (sequenceBuilderPoses.length >= 2 && sequenceName.trim()) ? '#3b82f6' : '#d1d5db',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: (sequenceBuilderPoses.length >= 2 && sequenceName.trim()) ? 'pointer' : 'not-allowed'
              }}
            >
              시퀀스 생성
            </button>
          </div>
          <div style={{ marginTop: '10px', marginBottom: '12px' }}>
            <button onClick={exportSequences} disabled={!sequences.length}>시퀀스 내보내기</button>
            <label style={{ marginLeft: '10px', display: 'inline-block' }}>
              <button onClick={() => sequenceFileInputRef.current?.click()}>시퀀스 가져오기</button>
              <input
                type="file"
                ref={sequenceFileInputRef}
                onChange={importSequences}
                accept=".json"
                style={{ display: 'none' }}
              />
            </label>
          </div>

          {sequences.length > 0 && (
            <div style={{ marginTop: '12px' }}>
              <h5 style={{ margin: '0 0 8px 0' }}>저장된 시퀀스</h5>
              <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                {sequences.map(seq => (
                  <div key={seq.id} style={{ marginBottom: '16px', border: '1px solid #e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', padding: '8px', backgroundColor: '#f9fafb' }}>
                      <span style={{ flex: 1, fontWeight: 'bold' }}>{seq.name}</span>
                      <span style={{ marginRight: '12px', color: '#6b7280' }}>{seq.poses.length} 포즈</span>
                      <button 
                        onClick={() => playSequence(seq)}
                        disabled={isPlaying && currentSequence?.id !== seq.id}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: isPlaying && currentSequence?.id === seq.id ? '#ef4444' : '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          marginRight: '8px',
                          minWidth: '60px'
                        }}
                      >
                        {isPlaying && currentSequence?.id === seq.id ? '정지' : '재생'}
                      </button>
                      <button 
                        onClick={() => deleteSequence(seq.id)}
                        disabled={isPlaying}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: isPlaying ? '#9ca3af' : '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: isPlaying ? 'not-allowed' : 'pointer',
                          minWidth: '60px'
                        }}
                      >
                        삭제
                      </button>
                    </div>
                    <div style={{ padding: '8px', backgroundColor: 'white' }}>
                      {seq.poses.map((pose, idx) => {
                        const poseData = recordedPoses.find(p => p.id === pose.poseId);
                        return (
                          <div key={`${seq.id}-${idx}`} style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            marginBottom: '8px',
                            padding: '8px',
                            backgroundColor: idx % 2 === 0 ? '#f9fafb' : 'white',
                            borderRadius: '4px',
                            transition: 'background-color 0.2s'
                          }}>
                            <span style={{ flex: 1, fontSize: '0.9rem' }}>
                              {idx + 1}. {poseData ? poseData.name : `알 수 없는 포즈 (${pose.poseId})`}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', marginRight: '12px' }}>
                              <span style={{ marginRight: '8px', fontSize: '0.8rem', color: '#4b5563' }}>지속시간 (ms):</span>
                              <input
                                type="number"
                                min="100"
                                step="100"
                                value={pose.duration}
                                onChange={(e) => updatePoseDuration(seq.id, idx, parseInt(e.target.value) || 1000)}
                                disabled={isPlaying}
                                style={{
                                  width: '80px',
                                  padding: '4px 8px',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '4px',
                                  marginRight: '8px',
                                  backgroundColor: isPlaying ? '#f3f4f6' : 'white',
                                  color: isPlaying ? '#9ca3af' : '#1f2937'
                                }}
                              />
                            </div>
                            <button 
                              onClick={() => {
                                const poseToApply = recordedPoses.find(p => p.id === pose.poseId);
                                if (poseToApply) {
                                  applyPose(poseToApply.joints);
                                }
                              }}
                              disabled={isPlaying}
                              style={{
                                padding: '4px 8px',
                                backgroundColor: isPlaying ? '#9ca3af' : '#3b82f6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: isPlaying ? 'not-allowed' : 'pointer',
                                marginRight: '4px',
                                fontSize: '0.8rem',
                                minWidth: '60px'
                              }}
                            >
                              보기
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 조인트 제어 섹션 */}
        <div style={{ margin: '16px 0', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
          <h4 style={{ marginTop: 0, marginBottom: '12px' }}>조인트 제어</h4>
          {joints.length === 0 ? (
            <div style={{ color: '#666' }}>
              {robot ? '현재 모델은 조인트 정보가 없습니다.' : '로드된 조인트가 없습니다. URDF 파일을 로드해주세요.'}
            </div>
          ) : (
            <div>
              {joints.map(j => (
                <div key={j.name} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>
                    {j.name} ({deg(j.min).toFixed(0)}° ~ {deg(j.max).toFixed(0)}°)
                  </div>
                  <input
                    type="range"
                    min={j.min}
                    max={j.max}
                    step={Math.abs(j.max - j.min) / 100 || 0.01}
                    value={j.value}
                    onChange={e => onChangeJoint(j.name, parseFloat(e.target.value))}
                    style={{ width: '100%' }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [isCaptureMode, setIsCaptureMode] = useState(false);

  if (isCaptureMode) {
    return <CaptureModeView onExit={() => setIsCaptureMode(false)} />;
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <AppContent onEnterCaptureMode={() => setIsCaptureMode(true)} />
    </DndProvider>
  );
}

export default App;