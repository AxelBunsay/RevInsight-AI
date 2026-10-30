import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CustomerPage } from './CustomerLayout';
import ProductDetailContent from './ProductDetailContent';

export default function ProductDetail() {
  const { productId } = useParams();
  const [product, setProduct] = useState(null);
  const handleProductLoaded = useCallback((loadedProduct) => setProduct(loadedProduct), []);

  return <CustomerPage title={product?.name || 'Product details'} description="Product details and availability.">
    <div className="customer-flow-page">
      {product && <nav className="customer-breadcrumbs" aria-label="Breadcrumb">
        <Link to="/customer/shop">Shop</Link><span>/</span><span>{product.category}</span><span>/</span><span>{product.name}</span>
      </nav>}
      <ProductDetailContent key={productId} productId={productId} onProductLoaded={handleProductLoaded} />
    </div>
  </CustomerPage>;
}
