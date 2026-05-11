import { useEffect, useState } from 'react';
import { Image as KonvaImage, Rect, Line } from 'react-konva';

interface Props {
  url: string | null;
  width: number;
  height: number;
}

export function FloorPlanLayer({ url, width, height }: Props) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!url) {
      setImage(null);
      return;
    }
    const img = new window.Image();
    // Match origin: backend serves /uploads via Express
    img.src = url.startsWith('http') ? url : url;
    img.onload = () => setImage(img);
    img.onerror = () => setImage(null);
  }, [url]);

  // White background
  return (
    <>
      {/* White paper */}
      <Rect x={0} y={0} width={width} height={height} fill="white" stroke="#cbd5e1" strokeWidth={1} />

      {/* Uploaded floor plan image */}
      {image ? (
        <KonvaImage image={image} x={0} y={0} width={width} height={height} listening={false} />
      ) : (
        <FallbackGrid width={width} height={height} />
      )}
    </>
  );
}

// Fallback when no floor plan uploaded yet — show a light grid
function FallbackGrid({ width, height }: { width: number; height: number }) {
  const step = 50;  // px
  const lines: JSX.Element[] = [];

  // Vertical lines
  for (let x = 0; x <= width; x += step) {
    lines.push(
      <Line
        key={`v-${x}`}
        points={[x, 0, x, height]}
        stroke="#e2e8f0"
        strokeWidth={x % (step * 4) === 0 ? 1 : 0.5}
      />,
    );
  }
  // Horizontal lines
  for (let y = 0; y <= height; y += step) {
    lines.push(
      <Line
        key={`h-${y}`}
        points={[0, y, width, y]}
        stroke="#e2e8f0"
        strokeWidth={y % (step * 4) === 0 ? 1 : 0.5}
      />,
    );
  }

  return <>{lines}</>;
}
