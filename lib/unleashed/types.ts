/**
 * TypeScript shapes for Unleashed API responses.
 * Only the fields the dashboard consumes are typed. Unknown fields pass
 * through but should not be relied on.
 *
 * Dates use Unleashed's .NET JSON format /Date(...)/ - use parseUnleashedDate.
 */

export interface UnleashedReference {
  Guid: string;
  Name?: string;
  Obsolete?: boolean;
}

export interface UnleashedProductGroup {
  Guid: string;
  GroupName: string;
  ParentGroupGuid: string | null;
  LastModifiedOn: string | null;
}

export interface UnleashedProductAttribute {
  Guid: string;
  Name: string;
  Value: string | null;
  IsRequired: boolean;
}

export interface UnleashedAttributeSet {
  Guid: string;
  SetName: string;
  Type: string;
  Attributes: UnleashedProductAttribute[];
}

export interface UnleashedInventoryDetail {
  Warehouse: {
    Guid: string;
    WarehouseCode: string;
    WarehouseName: string;
  };
  BinLocation: string | null;
  WarehouseMinStockAlertLevel: number | null;
  WarehouseMaxStockAlertLevel: number | null;
}

export interface UnleashedProduct {
  Guid: string;
  ProductCode: string;
  ProductDescription: string;
  Barcode: string | null;
  PackSize: number;
  Width: number | null;
  Height: number | null;
  Depth: number | null;
  Weight: number | null;
  UnitOfMeasure: UnleashedReference;
  IsSellable: boolean;
  Obsolete: boolean;
  NeverDiminishing: boolean;
  ProductGroup: UnleashedProductGroup | null;
  AttributeSet: UnleashedAttributeSet | null;
  InventoryDetails: UnleashedInventoryDetail[];
  LastModifiedOn: string | null;
}

export interface UnleashedWarehouse {
  Guid: string;
  WarehouseCode: string;
  WarehouseName: string;
  Obsolete: boolean;
}

export interface UnleashedCustomer {
  Guid: string;
  CustomerCode: string;
  CustomerName: string;
  Obsolete: boolean;
  LastModifiedOn: string | null;
}

export interface UnleashedSalesOrderLine {
  Guid: string;
  LineNumber: number;
  Product: UnleashedReference & { ProductCode?: string };
  OrderQuantity: number;
  UnitPrice: number | null;
  LineTotal: number | null;
  LineTax: number | null;
  Comments: string | null;
}

export interface UnleashedSalesOrder {
  Guid: string;
  OrderNumber: string;
  OrderStatus: string;
  Customer: UnleashedReference & { CustomerCode?: string };
  Warehouse: UnleashedReference & { WarehouseCode?: string };
  OrderDate: string | null;
  RequiredDate: string | null;
  SubTotal: number | null;
  TaxTotal: number | null;
  Total: number | null;
  Currency: { CurrencyCode: string } | null;
  SalesOrderLines: UnleashedSalesOrderLine[];
  LastModifiedOn: string | null;
}

export interface UnleashedShipmentLine {
  Guid: string;
  LineNumber: number;
  Product: UnleashedReference & { ProductCode?: string };
  ShippedQuantity: number;
  UnitPrice: number | null;
  LineTotal: number | null;
  OrderLineGuid: string | null;
}

export interface UnleashedShipment {
  Guid: string;
  ShipmentNumber: string;
  ShipmentStatus: string;
  OrderGuid: string | null;
  OrderNumber: string | null;
  Customer: UnleashedReference & { CustomerCode?: string };
  Warehouse: UnleashedReference & { WarehouseCode?: string };
  CarrierName: string | null;
  ShipmentMethod: string | null;
  RequiredDate: string | null;
  ShipmentDate: string | null;
  ShipmentLines: UnleashedShipmentLine[];
  LastModifiedOn: string | null;
}

export interface UnleashedStockOnHand {
  ProductGuid: string;
  ProductCode: string;
  Warehouse: UnleashedReference & { WarehouseCode?: string };
  AvailableQty: number;
  QtyOnHand: number;
  AllocatedQty: number;
}
