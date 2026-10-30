import { Link } from 'react-router-dom';
import ProductImage from './ProductImage';

const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

export default function ShopProductCard({
  product,
  variants,
  selectedStock,
  price,
  downPayment,
  downPaymentPercent,
  isOutOfStock,
  categoryIcon,
  onOpen
}) {
  return <Link
    className={`product-card${isOutOfStock ? ' is-out-of-stock' : ''}`}
    to={`/customer/products/${product._id}`}
    aria-label={`${product.name}, ${variants.length ? `From ${money(price)}` : money(price)}${isOutOfStock ? ', Out of stock' : ''}`}
    onClick={onOpen}
  >
    <div className="product-image">
      <ProductImage src={product.imageUrl || product.image} alt="" className="product-image-photo" fallback={<div className="product-image-placeholder" aria-hidden="true">
        <span>{categoryIcon(product.category)}</span>
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
