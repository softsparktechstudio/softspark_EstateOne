export default function Logo({ light = false }) {
  return (
    <div className={`logo ${light ? 'logo-light' : ''}`}>
      <img className="logo-image" src="/softspark-logo.png" alt="SoftSpark" />
      <span className="logo-text">
        <span>SoftSpark</span>
        <b>EstateOne</b>
      </span>
    </div>
  );
}
