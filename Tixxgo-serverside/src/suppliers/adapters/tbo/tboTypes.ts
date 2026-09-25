export interface TboFlightResult {
  ResultIndex: string;
  Airline: string;
  AirlineName?: string;
  FlightNumber: string;
  Origin: string;
  Destination: string;
  DepartureTime: string;
  ArrivalTime: string;
  Duration: number;
  CabinClass: string;
  FareFamily?: string;
  Baggage?: string;
  IsRefundable: boolean;
  Fare: {
    BaseFare: number;
    Tax: number;
    TotalFare: number;
    Currency?: string;
  };
}

export interface TboSearchResponse {
  TraceId: string;
  Response: { Results: TboFlightResult[][] };
}

export interface TboFareResponse {
  TraceId: string;
  Response: { ResultIndex: string; Fare: TboFlightResult['Fare'] };
}

export interface TboBookingResponse {
  TraceId: string;
  Response: { Status: 'CONFIRMED' | 'FAILED'; PNR?: string; Message?: string };
}

export interface TboStatusResponse {
  TraceId: string;
  Response: { Status: 'CONFIRMED' | 'NOT_FOUND' | 'PENDING'; PNR?: string };
}
