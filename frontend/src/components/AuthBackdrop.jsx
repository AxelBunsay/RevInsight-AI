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

export default function AuthBackdrop({ variant = 'streaks' }) {
  return (
    <div className={`auth-backdrop auth-backdrop--${variant}`} aria-hidden="true">
      {variant === 'cogs' ? <CogBackdrop /> : STREAKS.map((streak) => (
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