export default function Logo({ light = false }) {
  return (
    <div className={`logo ${light ? 'logo-light' : ''}`}>
      <img className="logo-image" src="/softspark-logo.png" alt="SoftSpark EstateOne" />
      <span className="logo-text">SoftSpark <b>EstateOne</b></span>
    </div>
  );
}
