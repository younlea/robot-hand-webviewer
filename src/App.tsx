import React, { useEffect, useMemo, useRef, useState, useCallback, ChangeEvent } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import URDFLoader from 'urdf-loader';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

type JointPose = {
  [key: string]: number;
};

type RecordedPose = {
  id: string;
  name: string;
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

const AppContent: React.FC = () => {
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
    exportToFile(sequences, `robot-hand-sequences-${new Date().toISOString().split('T')[0]}.json`);
  }, [sequences]);

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
      if (Array.isArray(data) && data.every(seq => seq.id && seq.name && Array.isArray(seq.poses))) {
        setSequences(data);
        saveSequences(data);
        alert(`${data.length}개의 시퀀스를 성공적으로 가져왔습니다.`);
      } else {
        alert('잘못된 시퀀스 데이터 형식입니다.');
      }
    });
  }, [importFromFile, saveSequences]);

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
  return (
    <DndProvider backend={HTML5Backend}>
      <AppContent />
    </DndProvider>
  );
}

export default App;