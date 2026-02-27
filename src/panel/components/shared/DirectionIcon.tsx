// SVG direction icon component with optional focus indicator

export type FocusPosition = 'source' | 'target' | 'both' | 'none';

interface DirectionIconProps {
  sourceType: string;
  focusPosition: FocusPosition;
}

// Focus indicator: small blue rectangle
const FocusRect = ({ x, y }: { x: number; y: number }) => (
  <rect x={x} y={y} width={5} height={5} fill="#1a73e8" className="focus-indicator" />
);

// Line + arrowhead, drawn pointing right then rotated around center (8,8), then offset
const Arrow = ({ angle, offsetX = 0, offsetY = 0 }: { angle: number; offsetX?: number; offsetY?: number }) => (
  <g transform={offsetX || offsetY ? `translate(${offsetX}, ${offsetY})` : undefined}>
    <g transform={angle ? `rotate(${angle}, 8, 8)` : undefined}>
      <path d="M 2,8 L 7,8" fill="none" stroke="currentColor" strokeWidth={1.5} />
      <polygon points="6,4.5 6,11.5 12.5,8" fill="currentColor" />
    </g>
  </g>
);

// Diagonal angle for parent↔child arrows
const DIAG = 35;

// Down-right arrow (parent/top → child)
function DownRightArrow({ focusPosition }: { focusPosition: FocusPosition }) {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16}>
      <title>down-right</title>
      <Arrow angle={DIAG} offsetY={2}/>
      {focusPosition === 'source' && <FocusRect x={0} y={3.5} />}
      {focusPosition === 'target' && <FocusRect x={11} y={10.5} />}
    </svg>
  );
}

// Up-left arrow (child → parent)
function UpLeftArrow({ focusPosition }: { focusPosition: FocusPosition }) {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16}>
      <title>up-left</title>
      <Arrow angle={180 + DIAG} />
      {focusPosition === 'source' && <FocusRect x={11} y={9.5} />}
      {focusPosition === 'target' && <FocusRect x={0} y={3.5} />}
    </svg>
  );
}

// Right arrow (opener → opened)
function RightArrow({ focusPosition }: { focusPosition: FocusPosition }) {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16}>
      <title>right</title>
      <Arrow angle={0} />
      {focusPosition === 'source' && <FocusRect x={0} y={6.5} />}
      {focusPosition === 'target' && <FocusRect x={11} y={6.5} />}
    </svg>
  );
}

// Left arrow (opened → opener)
function LeftArrow({ focusPosition }: { focusPosition: FocusPosition }) {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16}>
      <title>left</title>
      <Arrow angle={180} />
      {focusPosition === 'source' && <FocusRect x={11} y={6.5} />}
      {focusPosition === 'target' && <FocusRect x={0} y={6.5} />}
    </svg>
  );
}

// Circular arrow (self): ┏▶━┓ ┗━━━┛
function CircularArrow({ focusPosition }: { focusPosition: FocusPosition }) {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16}>
      <title>self</title>
      <path d="M 8,3 A 5,5 0 1,1 4,8" fill="none" stroke="currentColor" strokeWidth={1.5} />
      {/* Arrowhead on the left */}
      <polygon points="2,5.5 5.5,8 2,10.5" fill="currentColor" />
      {focusPosition === 'both' && <FocusRect x={6.5} y={0.5} />}
    </svg>
  );
}

// Uninvolved dot: small gray dot when focused frame isn't part of this message
function UninvolvedDot() {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16}>
      <title>uninvolved</title>
      <circle cx={8} cy={8} r={2} fill="#80868b" />
    </svg>
  );
}

// Unknown: question mark
function UnknownIcon() {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16}>
      <title>unknown</title>
      <text x={8} y={12} textAnchor="middle" fill="currentColor" fontSize={12}>?</text>
    </svg>
  );
}

export function DirectionIcon({ sourceType, focusPosition }: DirectionIconProps) {
  let icon: React.ReactNode;
  switch (sourceType) {
    case 'parent':
    case 'top':
      icon = <DownRightArrow focusPosition={focusPosition} />;
      break;
    case 'child':
      icon = <UpLeftArrow focusPosition={focusPosition} />;
      break;
    case 'opener':
      icon = <RightArrow focusPosition={focusPosition} />;
      break;
    case 'opened':
      icon = <LeftArrow focusPosition={focusPosition} />;
      break;
    case 'self':
      icon = <CircularArrow focusPosition={focusPosition} />;
      break;
    default:
      icon = <UnknownIcon />;
      break;
  }

  return <span className="direction-icon">{icon}</span>;
}

export function UninvolvedIcon() {
  return <span className="direction-icon"><UninvolvedDot /></span>;
}
