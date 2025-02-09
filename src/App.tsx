import {
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
  useEffect,
} from 'react';
import { Canvas, useLoader, useThree } from '@react-three/fiber';
import { CameraControls } from '@react-three/drei';
import {
  TextureLoader,
  LineSegments,
  LineBasicMaterial,
  Vector3,
  Mesh,
  Raycaster,
  Quaternion,
  Euler,
  type Camera,
  Matrix4,
  Spherical,
} from 'three';
import AutocompleteInput from './AutocompleteInput';
import { GeoJsonData, GeoJsonGeometry } from './geojson';
import { graticule10 } from './geojson/graticule';
import { Vec3D } from './geojson/geo-types';
import { computeCentroid } from './geojson/geo-utils';

useLoader.preload(TextureLoader, '/earth-day.webp');

const ROTATION_SPEED = 0.5;

interface SceneRef {
  setIsDragging: (value: boolean) => void;
  selectCountry: (name: string) => boolean;
}

interface SceneProps {
  setNames: (names: string[]) => void;
}

const Scene = forwardRef<SceneRef, SceneProps>(({ setNames }, ref) => {
  const globeMap = useLoader(TextureLoader, '/earth-day.webp');
  const isDragging = useRef<boolean>(false);
  const scene = useThree((state) => state.scene);
  const isLoading = useRef(false);
  const meshRef = useRef<Mesh>(null);
  const paintCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const countryNames = useRef<Map<string, number[][]>>(new Map());
  const cameraControlsRef = useRef<CameraControls | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      setIsDragging: (value: boolean) => {
        isDragging.current = value;
      },
      selectCountry: (name: string) => {
        const vertices = countryNames.current.get(name);
        let shouldCenter = true;
        if (vertices) {
          for (const vertex of vertices) {
            markCountry(vertex, shouldCenter);
            shouldCenter = false;
          }

          return true;
        }

        return false;
      },
    }),
    []
  );

  const rotateToPoint = (point: Vector3) => {
    if (!cameraControlsRef.current) return;

    // Convert the point to spherical coordinates
    const spherical = new Spherical();
    spherical.setFromVector3(point);

    // Only rotate the camera using azimuthal and polar angles
    cameraControlsRef.current.rotateTo(
      spherical.theta, // azimuthal angle (around y-axis)
      spherical.phi, // polar angle (from y-axis)
      true // enable smooth transition
    );
  };

  const markCountry = (vertices: number[], shouldCenter = false) => {
    if (!meshRef.current || !paintCanvasRef.current) return;

    const ctx = paintCanvasRef.current.getContext('2d');
    const width = paintCanvasRef.current.width;
    const height = paintCanvasRef.current.height;

    if (!ctx) return;

    ctx.beginPath();

    // Get the scene's transformation matrix
    const sceneMatrix = scene.matrixWorld;

    for (let i = 0; i < vertices.length; i += 3) {
      const point = new Vector3(
        vertices[i] * 1.1,
        vertices[i + 1] * 1.1,
        vertices[i + 2] * 1.1
      );
      point.applyMatrix4(sceneMatrix);
      const dir = new Vector3(-vertices[i], -vertices[i + 1], -vertices[i + 2]);
      dir.applyMatrix4(sceneMatrix);
      dir.normalize();

      const ray = new Raycaster(point, dir);
      if (!meshRef.current) {
        continue;
      }
      const it = ray.intersectObject(meshRef.current, false);
      if (it.length === 0) continue;
      const x = it[0].uv!.x * width;
      const y = (1 - it[0].uv!.y) * height;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.closePath();
    ctx.fillStyle = '#ff0000';
    ctx.fill();

    globeMap.needsUpdate = true;

    if (!shouldCenter || !cameraControlsRef) {
      return;
    }
    const centroid = computeCentroid(vertices);
    let pointV = new Vector3(centroid[0], centroid[1], centroid[2]);
    pointV = pointV.normalize();
    rotateToPoint(pointV);
    // Rotate the scene so the camera points out to pointV at the center
  };

  useEffect(() => {
    if (isLoading.current) {
      return;
    }

    const loadGeoJson = async () => {
      const response = await fetch('/world.geo.json');
      const countries = await response.json();

      const alt = 1.001;

      const lineObjs: LineSegments[] = [
        new LineSegments(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          new GeoJsonGeometry(graticule10() as any, alt),
          new LineBasicMaterial({
            color: 'white',
            opacity: 0.04,
            transparent: true,
          })
        ),
      ];

      const materials = [
        new LineBasicMaterial({ color: 'blue' }), // outer ring
        new LineBasicMaterial({
          color: 'green',
        }), // inner holes
      ];
      const names = new Map<string, number[][]>();
      countries.features.forEach(
        ({
          properties,
          geometry,
        }: {
          properties: { name_es: string };
          geometry: GeoJsonData;
        }) => {
          const geo = new GeoJsonGeometry(geometry, alt);
          const seg = new LineSegments(geo, materials);
          lineObjs.push(seg);
          const vertices = [];
          for (const g of geo.geoGroups) {
            vertices.push(g.vertices);
          }
          names.set(properties?.name_es, vertices);
        }
      );
      countryNames.current = names;

      lineObjs.forEach((obj) => scene.add(obj));
    };

    if (!paintCanvasRef.current) {
      paintCanvasRef.current = document.createElement('canvas');
      paintCanvasRef.current.width = (
        globeMap.image as HTMLImageElement
      ).naturalWidth;
      paintCanvasRef.current.height = (
        globeMap.image as HTMLImageElement
      ).naturalHeight;
      paintCanvasRef.current
        ?.getContext('2d')
        ?.drawImage(globeMap.image as HTMLImageElement, 0, 0);
      globeMap.image = paintCanvasRef.current;
      globeMap.needsUpdate = true;
    }

    if (meshRef.current) {
      // Rotate the material or the object once when created
      meshRef.current.rotation.set(0, -Math.PI / 2, 0); // Rotate 45° on X and Y
    }

    if (cameraControlsRef.current) {
      // Optional: Configure other control parameters
      cameraControlsRef.current.smoothTime = 0.25; // Transition time in seconds
      cameraControlsRef.current.draggingSmoothTime = 0.15; // Smoothness when dragging
    }

    isLoading.current = true;
    loadGeoJson().finally(() => {
      setNames(Array.from(countryNames.current.keys()));
      isLoading.current = false;
    });
  }, []);

  return (
    <>
      <CameraControls ref={cameraControlsRef} minDistance={2} maxDistance={5} />
      <mesh ref={meshRef}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshBasicMaterial map={globeMap} />
      </mesh>
      <ambientLight intensity={0.5} color="#ffffff" />
    </>
  );
});

const GlobeVisualization = () => {
  const [searchCountry, setSearchCountry] = useState('');
  const [highlightedCountry, setHighlightedCountry] = useState(null);
  const sceneRef = useRef<SceneRef | null>(null);
  const [names, setNames] = useState<string[]>([]);

  const handleSearchCountry = () => {
    if (!sceneRef) return;

    console.log(searchCountry);

    const result = sceneRef.current?.selectCountry(searchCountry.trim());

    if (!result) {
      // TODO: report error invalid name

      return;
    }

    setSearchCountry('');
  };

  return (
    <div className="max-w-4xl mx-auto p-4 bg-white shadow-md rounded-lg">
      <h2 className="text-2xl font-bold mb-4">Interactive World Globe</h2>
      <div className="flex space-x-2 mb-4">
        <AutocompleteInput
          options={names}
          className="w-full"
          setInputValue={setSearchCountry}
          inputValue={searchCountry}
        />
        <button
          onClick={handleSearchCountry}
          className="bg-blue-500 text-white px-4 py-1 rounded-md hover:bg-blue-600 transition-colors"
        >
          Highlight
        </button>
      </div>
      {highlightedCountry && (
        <p className="text-sm text-gray-600 mb-2">
          Highlighted Country: {highlightedCountry}
        </p>
      )}
      <div className="w-full h-[500px] bg-gray-100 rounded-lg cursor-move">
        <Canvas camera={{ zoom: 3 }}>
          <Scene ref={sceneRef} setNames={setNames} />
        </Canvas>
      </div>
    </div>
  );
};

export default GlobeVisualization;
