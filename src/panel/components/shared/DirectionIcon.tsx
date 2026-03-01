// SVG direction icon component with optional focus indicator

export type FocusPosition = 'source' | 'target' | 'both' | 'none';

interface DirectionIconProps {
  sourceType: string;
  focusPosition: FocusPosition;
}

// Focus indicator: small blue rectangle
const FocusRect = ({ x, y }: { x: number; y: number }) => (
  <rect x={x} y={y} width={5} height={5} rx={1} fill="#1a73e8" className="focus-indicator" />
);

// Line + arrowhead, drawn pointing right then rotated around center (8,8), then offset
const Arrow = ({ angle, offsetX = 0, offsetY = 0 }: { angle: number; offsetX?: number; offsetY?: number }) => (
  <g transform={offsetX || offsetY ? `translate(${offsetX}, ${offsetY})` : undefined}>
    <g transform={angle ? `rotate(${angle}, 8, 8)` : undefined}>
      <path d="M 2,8 L 10.5,8" fill="none" stroke="currentColor" strokeWidth={1.5} />
      <path d="M 7,5 L 12,8 L 7,11" fill="none" stroke="currentColor" strokeWidth={1.5} />
    </g>
  </g>
);

// Diagonal angle for parent↔child arrows
const DIAG = 45;

function InboundDiagonal({ direction }: { direction: 'down-right' | 'up-left' }) {
  const angle = direction === 'down-right' ?  0 : 180;
  return (
    <g transform={angle ? `rotate(${angle}, 8, 8)` : undefined}>
      <Arrow angle={DIAG} offsetY={-1.6} offsetX={-1.6}/>
      <FocusRect x={10} y={10} />
    </g>
  );
}

function OutboundDiagonal({ direction }: { direction: 'down-right' | 'up-left' }) {
  const angle = direction === 'down-right' ?  0 : 180;
  return (
    <g transform={angle ? `rotate(${angle}, 8, 8)` : undefined}>
      <Arrow angle={DIAG} offsetY={2} offsetX={2}/>
      <FocusRect x={1} y={1} />
    </g>
  );
}

function InboundHorizontal({ direction }: { direction: 'left' | 'right' }) {
  const angle = direction === 'right' ? 0 : 180;
  return (
    <g transform={angle ? `rotate(${angle}, 8, 8)` : undefined}>
      <Arrow angle={0} offsetX={-2.4} />
      <FocusRect x={11} y={5.5} />
    </g>
  )
}

function OutboundHorizontal({ direction }: { direction: 'left' | 'right' }) {
  const angle = direction === 'right' ? 0 : 180;
  return (
    <g transform={angle ? `rotate(${angle}, 8, 8)` : undefined}>
      <Arrow angle={0} offsetX={2.4} />
      <FocusRect x={0} y={5.5} />
    </g>
  )
}

// Circular arrow (self): ┏▶━┓ ┗━━━┛
function CircularArrow({ focusPosition }: { focusPosition: FocusPosition }) {
  return (
    <>
      <path d="M 3.5,12.5 L 8,12.5 A 5,5 0 1,0 4.5,6 L 3.5,8.5" fill="none" stroke="currentColor" strokeWidth={1.5} />
      {/* Arrowhead on the top */}
      <g transform="rotate(17, 3.5, 10)">
        <path d="M 0.5,4.1 L 3.5,9 L 6.5,4.1" fill="none" stroke="currentColor" strokeWidth={1.5} />
      </g> 
      <FocusRect x={1} y={10} />
    </>
  );
}

// Uninvolved dot: small gray dot when focused frame isn't part of this message
function UninvolvedDot() {
  return <circle cx={8} cy={8} r={2} fill="#80868b" />;
}

// Unknown: question mark
function UnknownIcon() {
  return <text x={8} y={12} textAnchor="middle" fill="currentColor" fontSize={12}>?</text>;
}

function IconSvg({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16}>
      <title>{title}</title>
      {children}
    </svg>
  );
}

function IconContent({ sourceType, focusPosition }: DirectionIconProps) {
    const canonicalSourceType = sourceType === 'top' ? 'parent' : sourceType; // "top" is an alias for "parent"  

  switch (`${canonicalSourceType}:${focusPosition}`) {
    case 'parent:none':
      return <Arrow angle={DIAG}/>;
    case 'parent:source':
      return <OutboundDiagonal direction="down-right" />;
    case 'parent:target':
      return <InboundDiagonal direction="down-right" />;

    case 'child:none':
      return <Arrow angle={180 + DIAG}/>;
    case 'child:source':
      return <OutboundDiagonal direction="up-left" />;
    case 'child:target':
      return <InboundDiagonal direction="up-left" />;
    
    case 'opener:none':
      return <Arrow angle={0} />;
    case 'opener:source':
        return <OutboundHorizontal direction="right" />;
    case 'opener:target':
      return <InboundHorizontal direction="right" />;
    
    case 'opened:none':
      return <Arrow angle={180} />;
    case 'opened:source':
      return <OutboundHorizontal direction="left" />;
    case 'opened:target':
      return <InboundHorizontal direction="left" />;

    case 'self:source':
    case 'self:target':
    case 'self:both':
    case 'self:none':
      return <CircularArrow focusPosition={focusPosition} />;

    default:
      return <UnknownIcon />;
  }
}

// Map sourceType to [source label, target label]
const SOURCE_TARGET_LABELS: Record<string, [string, string]> = {
  parent: ['parent', 'child'],
  top: ['parent', 'child'],
  child: ['child', 'parent'],
  self: ['self', 'self'],
  opener: ['opener', 'opened'],
  opened: ['opened', 'opener'],
};

function getTitle(sourceType: string, focusPosition: FocusPosition): string {
  const labels = SOURCE_TARGET_LABELS[sourceType];
  if (!labels) return sourceType;
  let [source, target] = labels;
  if (focusPosition === 'source' || focusPosition === 'both') source = 'focused';
  if (focusPosition === 'target' || focusPosition === 'both') target = 'focused';
  return `${source} to ${target}`;
}

export function DirectionIcon({ sourceType, focusPosition }: DirectionIconProps) {
  return (
    <span className="direction-icon">
      <IconSvg title={getTitle(sourceType, focusPosition)}>
        <IconContent sourceType={sourceType} focusPosition={focusPosition} />
      </IconSvg>
    </span>
  );
}

export function UninvolvedIcon() {
  return (
    <span className="direction-icon">
      <IconSvg title="uninvolved"><UninvolvedDot /></IconSvg>
    </span>
  );
}
