import { Link } from 'react-router-dom';
import ProductImage from './ProductImage';

const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

export default function ShopProductCard({
  to,
  product,
  variants,
  selectedStock,
  price,
  downPayment,
  downPaymentPercent,
  isOutOfStock,
  onOpen
}) {
  return <Link
    className={`product-card${isOutOfStock ? ' is-out-of-stock' : ''}`}
    to={to || `/customer/products/${product._id}`}
    aria-label={`${product.name}, ${variants.length ? `From ${money(price)}` : money(price)}${isOutOfStock ? ', Out of stock' : ''}`}
    onClick={onOpen}
    onKeyDown={(event) => {
      if (event.key === ' ') {
        event.preventDefault();
        event.currentTarget.click();
      }
    }}
  >
    <div className="product-image">
      <ProductImage src={product.imageUrl || product.image} alt="" className="product-image-photo" fallback={<div className="product-image-placeholder" aria-hidden="true">
        <svg viewBox="0 0 48 48" focusable="false">
          <path d="M5 14.5 24 5l19 9.5v20L24 44 5 34.5v-20Z" />
          <path d="m5.5 15 18.5 9.5L42.5 15M24 25v18M15 10l18 10" />
        </svg>
      </div>} />
      <span className="product-badge">{product.category}</span>
    </div>
    <div className="product-card-body">
      <h2>{product.name}</h2>
      <p className="product-price">
        {variants.length ? `From ${money(price)}` : money(price)}
      </p>
      <p className="product-down-payment">
        {downPayment === null ? 'Reserve now: unavailable' : `Reserve now: ${money(downPayment)} (${downPaymentPercent}%)`}
      </p>
      <p className={`product-stock${variants.length && !isOutOfStock ? ' is-options' : ''}${isOutOfStock ? ' product-stock-out' : ''}`}>
        {isOutOfStock ? 'Out of stock' : variants.length ? `${variants.length} options` : `Available: ${selectedStock}`}
      </p>
    </div>
  </Link>;
}
