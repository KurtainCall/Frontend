// src/Map/recommendPlaces.js

// �Ÿ� ��� (Haversine ����)
export const getDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371; // ���� ������ (km)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
  
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };
  
  // ��õ ���� - īī�� API ������ ���
  export const rankPlaces = (userLat, userLng, spots) => {
    // ����ġ ����
    const ratingWeight = 3.0;  // ���� ����ġ (�������� ������ �߿�)
    const reviewWeight = 0.1;  // ����� ����ġ (�������� ������� �������� ����)
    const distancePenalty = 2.0;  // �Ÿ� ���Ƽ (�������� �Ÿ��� �ּ��� �Ҹ�)
    const reliabilityWeight = 0.5;  // ���� ���� ����ġ (�ŷڵ�)
  
    return spots
      .map(p => {
        const dist = getDistance(userLat, userLng, p.lat, p.lng);
        
        // īī�� API���� ������ ���� ������ ���
        const rating = p.rating || 0;                    // ���� ���� (0-5)
        const reviewCount = p.reviewCount || 0;          // ���� �����
        const ratingCount = p.ratingCount || 0;          // ���� ���� ����
        
        // �ŷڵ� ���� ��� (���� ������ �������� �ŷڵ� ����)
        const reliability = Math.min(ratingCount / 10, 1); // �ִ� 1.0
        
        // ���� ���� ���
        const score = (rating * ratingWeight) + 
                     (reviewCount * reviewWeight) + 
                     (reliability * reliabilityWeight) - 
                     (dist * distancePenalty);
  
        return { 
          ...p, 
          dist: Math.round(dist * 100) / 100, // �Ҽ��� 2�ڸ�����
          reviewCount, 
          rating, 
          ratingCount,
          reliability: Math.round(reliability * 100) / 100,
          score: Math.round(score * 100) / 100
        };
      })
      .filter(p => p.dist <= 5.0) // �ݰ� 5km�� Ȯ�� (�� ���� ������)
      .filter(p => p.rating > 0)  // ������ �ִ� ��Ҹ�
      .sort((a, b) => b.score - a.score)
      .slice(0, 3); // TOP3
  };

  // ��õ ����� ����� ģȭ������ ������
  export const formatRecommendation = (recommendedPlaces) => {
    return recommendedPlaces.map((place, index) => ({
      rank: index + 1,
      name: place.name,
      address: place.address,
      distance: `${place.dist}km`,
      rating: place.rating,
      reviewCount: place.reviewCount,
      score: place.score,
      type: place.type,
      phone: place.phone,
      detailUrl: place.detailUrl
    }));
  };
  