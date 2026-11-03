import './css/auth-backdrop.css';

const STREAKS = [
  { id: 'streak-01', top: '3%', width: '280px', height: '2px', opacity: '0.34', duration: '8.2s', delay: '-5.2s', color: 'rgba(242, 107, 29, 0.9)' },
  { id: 'streak-02', top: '7%', width: '430px', height: '3px', opacity: '0.22', duration: '12.4s', delay: '-9.1s', color: 'rgba(255, 226, 200, 0.9)' },
  { id: 'streak-03', top: '11%', width: '190px', height: '2px', opacity: '0.48', duration: '6.3s', delay: '-2.7s', color: 'rgba(242, 107, 29, 0.9)' },
  { id: 'streak-04', top: '15%', width: '520px', height: '2px', opacity: '0.19', duration: '13.5s', delay: '-11.3s', color: 'rgba(255, 226, 200, 0.9)' },
  { id: 'streak-05', top: '19%', width: '340px', height: '3px', opacity: '0.41', duration: '9.4s', delay: '-6.8s', color: 'rgba(242, 107, 29, 0.9)' },
  { id: 'streak-06', top: '23%', width: '160px', height: '2px', opacity: '0.29', duration: '5.7s', delay: '-4.2s', color: 'rgba(255, 226, 200, 0.9)' },
  { id: 'streak-07', top: '27%', width: '470px', height: '3px', opacity: '0.53', duration: '11.2s', delay: '-7.9s', color: 'rgba(242, 107, 29, 0.9)' },
  { id: 'streak-08', top: '31%', width: '250px', height: '2px', opacity: '0.25', duration: '7.1s', delay: '-1.6s', color: 'rgba(255, 226, 200, 0.9)' },
  { id: 'streak-09', top: '35%', width: '560px', height: '2px', opacity: '0.37', duration: '14s', delay: '-12.6s', color: 'rgba(242, 107, 29, 0.9)' },
  { id: 'streak-10', top: '39%', width: '310px', height: '3px', opacity: '0.18', duration: '8.8s', delay: '-3.3s', color: 'rgba(255, 226, 200, 0.9)' },
  { id: 'streak-11', top: '43%', width: '210px', height: '2px', opacity: '0.46', duration: '6.8s', delay: '-5.9s', color: 'rgba(242, 107, 29, 0.9)' },
  { id: 'streak-12', top: '47%', width: '390px', height: '3px', opacity: '0.31', duration: '10.7s', delay: '-8.4s', color: 'rgba(255, 226, 200, 0.9)' },
  { id: 'streak-13', top: '51%', width: '145px', height: '2px', opacity: '0.52', duration: '5.2s', delay: '-2.1s', color: 'rgba(242, 107, 29, 0.9)' },
  { id: 'streak-14', top: '55%', width: '500px', height: '3px', opacity: '0.24', duration: '12.8s', delay: '-10.2s', color: 'rgba(255, 226, 200, 0.9)' },
  { id: 'streak-15', top: '59%', width: '270px', height: '2px', opacity: '0.39', duration: '7.8s', delay: '-6.1s', color: 'rgba(242, 107, 29, 0.9)' },
  { id: 'streak-16', top: '63%', width: '355px', height: '3px', opacity: '0.21', duration: '9.8s', delay: '-4.8s', color: 'rgba(255, 226, 200, 0.9)' },
  { id: 'streak-17', top: '67%', width: '180px', height: '2px', opacity: '0.45', duration: '6.1s', delay: '-3.7s', color: 'rgba(242, 107, 29, 0.9)' },
  { id: 'streak-18', top: '71%', width: '445px', height: '3px', opacity: '0.28', duration: '11.8s', delay: '-9.6s', color: 'rgba(255, 226, 200, 0.9)' },
  { id: 'streak-19', top: '75%', width: '235px', height: '2px', opacity: '0.5', duration: '7.4s', delay: '-1.2s', color: 'rgba(242, 107, 29, 0.9)' },
  { id: 'streak-20', top: '79%', width: '530px', height: '3px', opacity: '0.2', duration: '13.2s', delay: '-11.8s', color: 'rgba(255, 226, 200, 0.9)' },
  { id: 'streak-21', top: '83%', width: '320px', height: '2px', opacity: '0.43', duration: '9.1s', delay: '-7.1s', color: 'rgba(242, 107, 29, 0.9)' },
  { id: 'streak-22', top: '87%', width: '155px', height: '3px', opacity: '0.33', duration: '5.5s', delay: '-4.6s', color: 'rgba(255, 226, 200, 0.9)' },
  { id: 'streak-23', top: '91%', width: '405px', height: '2px', opacity: '0.26', duration: '10.3s', delay: '-8.8s', color: 'rgba(242, 107, 29, 0.9)' },
  { id: 'streak-24', top: '95%', width: '295px', height: '3px', opacity: '0.47', duration: '8.5s', delay: '-2.4s', color: 'rgba(255, 226, 200, 0.9)' },
  { id: 'streak-25', top: '13%', width: '375px', height: '2px', opacity: '0.36', duration: '10.1s', delay: '-6.5s', color: 'rgba(242, 107, 29, 0.9)' },
  { id: 'streak-26', top: '73%', width: '225px', height: '3px', opacity: '0.3', duration: '7.6s', delay: '-3.9s', color: 'rgba(255, 226, 200, 0.9)' }
];

const GEARS = [
  { id: 'gear-01', cx: 170, cy: 150, radius: 170, teeth: 20, duration: '90s', direction: 'cw' },
  { id: 'gear-02', cx: 388, cy: 306, radius: 102, teeth: 12, duration: '54s', direction: 'ccw' },
  { id: 'gear-03', cx: 560, cy: 150, radius: 136, teeth: 16, duration: '72s', direction: 'ccw' },
  { id: 'gear-04', cx: 1270, cy: 760, radius: 170, teeth: 20, duration: '90s', direction: 'ccw' },
  { id: 'gear-05', cx: 1052, cy: 604, radius: 102, teeth: 12, duration: '54s', direction: 'cw' },
  { id: 'gear-06', cx: 880, cy: 760, radius: 136, teeth: 16, duration: '72s', direction: 'cw' },
  { id: 'gear-07', cx: 1330, cy: 200, radius: 80, teeth: 10, duration: '43s', direction: 'cw' },
  { id: 'gear-08', cx: 110, cy: 760, radius: 80, teeth: 10, duration: '43s', direction: 'ccw' }
];

const TOOLS = [
  { id: 'tool-01', shape: 0, size: 92, mobileSize: 60, left: '5%', duration: '38s', delay: '-18s', opacity: 0.22, rotation: '360deg', staticTop: '8%' },
  { id: 'tool-02', shape: 1, size: 64, mobileSize: 44, left: '88%', duration: '46s', delay: '-31s', opacity: 0.18, rotation: '-270deg', staticTop: '22%' },
  { id: 'tool-03', shape: 2, size: 118, mobileSize: 80, left: '17%', duration: '52s', delay: '-12s', opacity: 0.28, rotation: '420deg', staticTop: '51%' },
  { id: 'tool-04', shape: 3, size: 76, mobileSize: 52, left: '71%', duration: '30s', delay: '-24s', opacity: 0.19, rotation: '-360deg', staticTop: '14%' },
  { id: 'tool-05', shape: 4, size: 104, mobileSize: 70, left: '42%', duration: '42s', delay: '-37s', opacity: 0.34, rotation: '540deg', staticTop: '75%' },
  { id: 'tool-06', shape: 0, size: 54, mobileSize: 38, left: '94%', duration: '27s', delay: '-7s', opacity: 0.16, rotation: '-240deg', staticTop: '31%' },
  { id: 'tool-07', shape: 1, size: 86, mobileSize: 58, left: '58%', duration: '48s', delay: '-42s', opacity: 0.25, rotation: '450deg', staticTop: '64%' },
  { id: 'tool-08', shape: 2, size: 124, mobileSize: 84, left: '28%', duration: '54s', delay: '-19s', opacity: 0.38, rotation: '-540deg', staticTop: '3%' },
  { id: 'tool-09', shape: 3, size: 68, mobileSize: 46, left: '78%', duration: '35s', delay: '-29s', opacity: 0.2, rotation: '180deg', staticTop: '42%' },
  { id: 'tool-10', shape: 4, size: 96, mobileSize: 65, left: '2%', duration: '44s', delay: '-11s', opacity: 0.3, rotation: '-420deg', staticTop: '88%' },
  { id: 'tool-11', shape: 0, size: 112, mobileSize: 76, left: '36%', duration: '33s', delay: '-23s', opacity: 0.17, rotation: '270deg', staticTop: '15%' },
  { id: 'tool-12', shape: 1, size: 44, mobileSize: 36, left: '65%', duration: '50s', delay: '-46s', opacity: 0.24, rotation: '-360deg', staticTop: '37%' },
  { id: 'tool-13', shape: 2, size: 82, mobileSize: 56, left: '11%', duration: '29s', delay: '-14s', opacity: 0.33, rotation: '480deg', staticTop: '59%' },
  { id: 'tool-14', shape: 3, size: 120, mobileSize: 82, left: '49%', duration: '41s', delay: '-33s', opacity: 0.21, rotation: '-540deg', staticTop: '81%' },
  { id: 'tool-15', shape: 4, size: 58, mobileSize: 40, left: '83%', duration: '53s', delay: '-9s', opacity: 0.36, rotation: '360deg', staticTop: '26%' },
  { id: 'tool-16', shape: 0, size: 102, mobileSize: 70, left: '23%', duration: '32s', delay: '-27s', opacity: 0.2, rotation: '-270deg', staticTop: '47%' },
  { id: 'tool-17', shape: 1, size: 74, mobileSize: 50, left: '91%', duration: '39s', delay: '-41s', opacity: 0.26, rotation: '540deg', staticTop: '70%' },
  { id: 'tool-18', shape: 2, size: 108, mobileSize: 74, left: '54%', duration: '47s', delay: '-16s', opacity: 0.18, rotation: '-420deg', staticTop: '11%' },
  { id: 'tool-19', shape: 3, size: 48, mobileSize: 36, left: '32%', duration: '28s', delay: '-35s', opacity: 0.31, rotation: '300deg', staticTop: '34%' },
  { id: 'tool-20', shape: 4, size: 90, mobileSize: 62, left: '7%', duration: '51s', delay: '-5s', opacity: 0.22, rotation: '-480deg', staticTop: '55%' },
  { id: 'tool-21', shape: 0, size: 116, mobileSize: 80, left: '75%', duration: '36s', delay: '-30s', opacity: 0.37, rotation: '360deg', staticTop: '77%' },
  { id: 'tool-22', shape: 1, size: 62, mobileSize: 42, left: '45%', duration: '45s', delay: '-21s', opacity: 0.16, rotation: '-240deg', staticTop: '93%' }
];

function ToolShape({ shape }) {
  switch (shape) {
    case 0:
      return <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />;
    case 1:
      return <><path d="M12 2.5l8 4.6v9.8l-8 4.6-8-4.6V7.1z" /><circle cx="12" cy="12" r="3.6" /></>;
    case 2:
      return <><path d="M7 2.5h10l1.5 4h-13z" /><path d="M9 6.5v15M15 6.5v15M9 21.5h6" /><path d="M9 10h6M9 13.5h6M9 17h6" /></>;
    case 3:
      return <><path d="M4 20l5-5" /><path d="M9 15l7.5-7.5" /><path d="M15 4.5l4.5 4.5-2.5 2.5-4.5-4.5z" /><path d="M3.5 20.5l1.5-3.5 2 2z" /></>;
    default:
      return <><path d="M9 2.5h6v5H9z" /><path d="M10 7.5v6M14 7.5v6" /><path d="M8.5 13.5h7l-1 3h-5z" /><path d="M12 16.5v4" /><path d="M10 20.5h4" /></>;
  }
}

function createGearPath(radius, teeth) {
  const rootRadius = radius * 0.82;
  const angleOffsets = [0, 0.16, 0.28, 0.72, 0.84, 1];
  const radii = [rootRadius, rootRadius, radius, radius, rootRadius, rootRadius];
  const points = [];

  for (let tooth = 0; tooth < teeth; tooth += 1) {
    const toothStart = (tooth * Math.PI * 2) / teeth;
    angleOffsets.forEach((offset, index) => {
      const angle = toothStart + (offset * Math.PI * 2) / teeth;
      points.push({
        x: Math.cos(angle) * radii[index],
        y: Math.sin(angle) * radii[index]
      });
    });
  }

  return `${points.map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')} Z`;
}

function CogBackdrop() {
  return (
    <svg className="auth-backdrop__gears" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" focusable="false">
      {GEARS.map((gear) => (
        <g key={gear.id} transform={`translate(${gear.cx} ${gear.cy})`}>
          <g
            className={`auth-backdrop__gear${gear.radius <= 102 ? ' auth-backdrop__gear--small' : ''}`}
            style={{
              '--gear-duration': gear.duration,
              '--gear-direction': gear.direction === 'cw' ? 'normal' : 'reverse'
            }}
          >
            <path
              className="auth-backdrop__gear-tooth"
              d={createGearPath(gear.radius, gear.teeth)}
            />
            <circle className="auth-backdrop__gear-ring" r={gear.radius * 0.62} />
            <circle className="auth-backdrop__gear-hub" r={gear.radius * 0.28} />
          </g>
        </g>
      ))}
    </svg>
  );
}

function ToolBackdrop() {
  return TOOLS.map((tool) => (
    <svg
      key={tool.id}
      className="auth-backdrop__tool"
      viewBox="0 0 24 24"
      fill="none"
      stroke="rgb(108, 92, 231)"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{
        '--tool-size': `${tool.size}px`,
        '--tool-mobile-size': `${tool.mobileSize}px`,
        '--tool-left': tool.left,
        '--tool-duration': tool.duration,
        '--tool-delay': tool.delay,
        '--tool-opacity': tool.opacity,
        '--rot': tool.rotation,
        '--tool-static-top': tool.staticTop
      }}
    >
      <ToolShape shape={tool.shape} />
    </svg>
  ));
}

export default function AuthBackdrop({ variant = 'streaks', baseColor = '#17100B', glowColor }) {
  const backdropStyle = {
    '--auth-backdrop-base': baseColor,
    '--auth-backdrop-extra-glow': variant === 'tools' ? 'none' : undefined,
    ...(glowColor ? {
      '--auth-backdrop-glow-top': `rgba(${glowColor}, 0.16)`,
      '--auth-backdrop-glow-bottom': `rgba(${glowColor}, 0.12)`
    } : {})
  };

  return (
    <div className={`auth-backdrop auth-backdrop--${variant}`} aria-hidden="true" style={backdropStyle}>
      {variant === 'cogs' ? <CogBackdrop /> : variant === 'tools' ? <ToolBackdrop /> : STREAKS.map((streak) => (
        <span
          key={streak.id}
          className="auth-backdrop__line"
          style={{
            '--line-top': streak.top,
            '--line-width': streak.width,
            '--line-height': streak.height,
            '--line-opacity': streak.opacity,
            '--line-duration': streak.duration,
            '--line-delay': streak.delay,
            '--line-color': streak.color
          }}
        />
      ))}
      <span className="auth-backdrop__vignette" />
    </div>
  );
}