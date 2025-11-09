import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import URDFLoader from 'urdf-loader'

function useThreeCanvas() {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const [renderer] = useState(() => new THREE.WebGLRenderer({ antialias: true }))
  const [scene] = useState(() => new THREE.Scene())
  const [camera] = useState(() => new THREE.PerspectiveCamera(45, 1, 0.01, 1000))
  const [controls, setControls] = useState<any>(null)

  useEffect(() => {
    if (!mountRef.current) return

    const mount = mountRef.current
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    mount.appendChild(renderer.domElement)

    camera.position.set(0.6, 0.4, 0.9)
    camera.lookAt(0, 0, 0)

    // OrbitControls for zoom and rotation
    const orbitControls = new OrbitControls(camera, renderer.domElement)
    orbitControls.enableDamping = true
    orbitControls.dampingFactor = 0.05
    orbitControls.target.set(0, 0.1, 0)
    
    // Enhanced zoom controls
    orbitControls.enableZoom = true
    orbitControls.zoomSpeed = 1.5
    orbitControls.minDistance = 0.2  // Prevent zooming too close
    orbitControls.maxDistance = 3.0  // Prevent zooming too far
    
    // Smooth zooming
    orbitControls.enableSmoothZoom = true
    orbitControls.smoothZoomSpeed = 2.0
    
    // Disable panning if not needed
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

    // lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const dir = new THREE.DirectionalLight(0xffffff, 0.8)
    dir.position.set(2, 3, 2)
    scene.add(dir)

    // simple grid
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

  return { mountRef, renderer, scene, camera, controls }
}

function deg(rad: number) { return (rad * 180) / Math.PI }
function rad(deg: number) { return (deg * Math.PI) / 180 }

export default function App() {
  const { mountRef, scene } = useThreeCanvas()
  const [robot, setRobot] = useState<any | null>(null)
  const [joints, setJoints] = useState<{ name: string, min: number, max: number, value: number }[]>([])
  const loader = useMemo(() => new URDFLoader(), [])

  // scale and material tuning
  loader.packages = {
    // can be extended to map package:// URLs
  }

  useEffect(() => {
    // load default URDF (4-DoF per finger)
    loader.load('/hand_4dof.urdf', (group: any) => {
      group.rotation.x = -Math.PI / 2 // z-up to y-up
      setRobot(group)
      scene.add(group)

      // Extract joints - urdf-loader 0.10.x uses 'joints' property
      const map = group.joints || group.jointMap || {}
      const items = Object.keys(map).map((name: string) => {
        const j: any = map[name]
        const lim = j.limit || { lower: -1.0, upper: 1.0 }
        const lower = lim.lower ?? -1.0
        const upper = lim.upper ?? 1.0
        return { name, min: lower, max: upper, value: j.jointValue ?? 0 }
      })
      setJoints(items)
    })
  }, [loader, scene])

  const onChangeJoint = (name: string, value: number) => {
    if (!robot) return
    ;(robot as any).setJointValue(name, value)
    setJoints((prev: { name: string; min: number; max: number; value: number }[]) =>
      prev.map((j: { name: string; min: number; max: number; value: number }) =>
        j.name === name ? { ...j, value } : j,
      ),
    )
  }

  const onLoadUrdfFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()

    // Create a blob URL and let loader fetch it
    const blob = new Blob([text], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)

    // remove previous
    if (robot) {
      scene.remove(robot)
      setRobot(null)
    }

    loader.load(url, (group: any) => {
      group.rotation.x = -Math.PI / 2
      setRobot(group)
      scene.add(group)

      const map = (group as any).jointMap || {}
      const items = Object.keys(map).map(name => {
        const j = map[name]
        const lim = j.limit || { lower: -1.0, upper: 1.0 }
        const lower = lim.lower ?? -1.0
        const upper = lim.upper ?? 1.0
        return { name, min: lower, max: upper, value: j.jointValue ?? 0 }
      })
      setJoints(items)
    })
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', height: '100%' }}>
      <div ref={mountRef} style={{ position: 'relative' }} />
      <div style={{ padding: 12, overflow: 'auto', borderLeft: '1px solid #e5e7eb' }}>
        <h3 style={{ marginTop: 0 }}>URDF 뷰어</h3>
        <input type="file" accept=".urdf, text/xml, application/xml" onChange={onLoadUrdfFile} />
        <div style={{ height: 12 }} />
        <div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>조인트 제어</div>
          {joints.length === 0 && <div style={{ color: '#666' }}>조인트가 없습니다.</div>}
          {joints.map(j => (
            <div key={j.name} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, marginBottom: 4 }}>{j.name} ({deg(j.min).toFixed(0)}° ~ {deg(j.max).toFixed(0)}°)</div>
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
      </div>
    </div>
  )
}
