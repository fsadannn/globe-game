import {
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
  useEffect,
} from 'react';
import { Canvas, useLoader, useThree } from '@react-three/fiber';
import {
  TextureLoader,
  LineSegments,
  LineBasicMaterial,
  Vector3,
  Mesh,
  Raycaster,
  Quaternion,
  Euler,
} from 'three';
import AutocompleteInput from './AutocompleteInput';
import { GeoJsonGeometry } from './geojson';
import { graticule10 } from './geojson/graticule';

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
  const previousMousePosition = useRef({ x: 0, y: 0 });
  const scene = useThree((state) => state.scene);
  const isLoading = useRef(false);
  const meshRef = useRef<Mesh>(null);
  const paintCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const countryNames = useRef<Map<string, number[][]>>(new Map());

  useImperativeHandle(
    ref,
    () => ({
      setIsDragging: (value: boolean) => {
        isDragging.current = value;
      },
      selectCountry: (name: string) => {
        const vertices = countryNames.current.get(name);
        if (vertices) {
          for (const vertex of vertices) {
            markCountry(vertex);
          }

          return true;
        }

        return false;
      },
    }),
    []
  );

  const markCountry = (vertices: number[]) => {
    if (!meshRef.current || !paintCanvasRef.current) return;

    const ctx = paintCanvasRef.current.getContext('2d');
    const width = paintCanvasRef.current.width;
    const height = paintCanvasRef.current.height;

    if (!ctx) return;

    ctx.beginPath();

    let v = new Vector3(0, 0, 0);
    let p = new Vector3(0, 0, 0);
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
      const x = it[0].uv.x * width;
      const y = (1 - it[0].uv.y) * height;

      if (i === 0) {
        ctx.moveTo(x, y);
        v = dir;
        p = point;
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.closePath();
    ctx.fillStyle = '#ff0000';
    ctx.fill();

    globeMap.needsUpdate = true;

    // const wd = scene.getWorldDirection(p);
    // wd.normalize();
    // v.normalize();
    // const quaternion = new Quaternion();
    // quaternion.setFromUnitVectors(wd, v);

    // // Convert the quaternion to Euler angles
    // const euler = new Euler();
    // euler.setFromQuaternion(quaternion);
    // scene.rotation.x = euler.x;
    // scene.rotation.y = euler.y;
    // scene.rotation.z = euler.z;
  };

  useEffect(() => {
    if (isLoading.current) return;

    const loadGeoJson = async () => {
      const response = await fetch('/world.geo.json');
      const countries = await response.json();

      const alt = 1.001;

      const lineObjs = [
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
      countries.features.forEach(({ properties, geometry }) => {
        const geo = new GeoJsonGeometry(geometry, alt);
        const seg = new LineSegments(geo, materials);
        lineObjs.push(seg);
        const vertices = [];
        for (const g of geo.geoGroups) {
          vertices.push(g.vertices);
        }
        names.set(properties?.name_es, vertices);
      });
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

    isLoading.current = true;
    loadGeoJson().finally(() => {
      setNames(Array.from(countryNames.current.keys()));
      isLoading.current = false;
    });
  }, []);

  const onWheel = ({ deltaY, camera }) => {
    const newPosition = camera.position.z + deltaY * 0.002;

    camera.position.z = Math.max(1.3, Math.min(newPosition, 5));
  };

  const onMouseMove = ({ offsetX, offsetY }) => {
    if (!isDragging.current) return;

    const deltaMove = {
      x: offsetX - previousMousePosition.current.x,
      y: offsetY - previousMousePosition.current.y,
    };

    // Horizontal rotation (Y-axis)
    scene.rotation.y += deltaMove.x * 0.01 * ROTATION_SPEED;

    // Vertical rotation (X-axis), with angle limit
    scene.rotation.x += deltaMove.y * 0.01 * ROTATION_SPEED;
    scene.rotation.x = Math.max(
      -Math.PI / 2,
      Math.min(Math.PI / 2, scene.rotation.x)
    );

    previousMousePosition.current = {
      x: offsetX,
      y: offsetY,
    };
  };

  const onMouseDown = ({ offsetX, offsetY }) => {
    isDragging.current = true;
    previousMousePosition.current = {
      x: offsetX,
      y: offsetY,
    };
  };

  const onMouseUp = () => {
    isDragging.current = false;
  };

  return (
    <>
      <mesh
        onWheel={onWheel}
        onPointerDown={onMouseDown}
        onPointerMove={onMouseMove}
        onPointerUp={onMouseUp}
        ref={meshRef}
      >
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
        <Canvas
          onMouseDown={() => {
            sceneRef.current?.setIsDragging(true);
          }}
          onMouseUp={() => {
            sceneRef.current?.setIsDragging(false);
          }}
          camera={{ zoom: 3 }}
        >
          <Scene ref={sceneRef} setNames={setNames} />
        </Canvas>
      </div>
    </div>
  );
};

export default GlobeVisualization;
