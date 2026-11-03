export default function Logo({ light = false }) {
  return (
    <div className={`logo ${light ? 'logo-light' : ''} estateone-sidebar-brand`}>
      <img className="logo-image" src="/softspark-logo.png" alt="SoftSpark" />
      <div className="logo-text estateone-brand-text">
        <span className="estateone-brand-softspark">SoftSpark</span>
        <span className="estateone-brand-name">EstateOne</span>
      </div>
    </div>
  );
}
