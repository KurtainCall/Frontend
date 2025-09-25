import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Topnav from '../components/Topnav';
import { playAPI } from '../services/api';
import locationService from '../services/locationService';
import { rankPlaces, formatRecommendation } from './recommendPlace';
// import { festivals } from '../data/festivals'; // 축제 데이터는 나중에 제거
import './Map.css';

// @ts-ignore
import { feature } from 'topojson-client';

// 카카오 api 응답 -> map.js에서 사용할 데이터 구조로 변환
const transformKakaoData = (kakaoResponse) => {
  return kakaoResponse.documents.map(place => ({
    id: place.id,
    name: place.place_name,
    type: 'theater', // 일단 카테고리 매핑은 단순화
    address: place.address_name,
    lat: parseFloat(place.y),
    lng: parseFloat(place.x),
    description: place.category_name,
    hours: '운영시간 정보 없음',
    tags: [place.category_group_code],
    detailUrl: place.place_url || '#',
    phone: place.phone || '',
    roadAddress: place.road_address_name || '',
    // 평점 및 리뷰 정보 추가
    rating: place.rating ? parseFloat(place.rating) : 0,
    reviewCount: place.review_count ? parseInt(place.review_count) : 0,
    ratingCount: place.rating_count ? parseInt(place.rating_count) : 0
  }))
};

// api 호출로 문화시설 가져오기
const fetchCultureSpotsFromKakao = async (query, lat, lng, radius = 5000) => {
  try {
    const response = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?` +
      `query=${encodeURIComponent(query)}&x=${lng}&y=${lat}&radius=${radius}&size=15&sort=distance`,
      {
        headers: {
          Authorization: `KakaoAK ${process.env.REACT_APP_KAKAO_API_KEY}`
        }
      }
    );
    const data = await response.json();
    return transformKakaoData(data);

  } catch (error) {
    console.error('카카오 Places API 호출 실패:', error);
    return [];
  }
};

const Map = () => {
  const navigate = useNavigate();
  const mapRef = useRef(null);

  // 문화시설 데이터 상태
  const [cultureSpots, setCultureSpots] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // 추천 관련 상태
  const [recommendedPlaces, setRecommendedPlaces] = useState([]);
  const [userLocation, setUserLocation] = useState({ lat: 37.5665, lng: 126.9780 }); // 기본값 설정
  const [showRecommendations, setShowRecommendations] = useState(false);

  // Kakao Maps 관련 refs
  const kakaoRef = useRef(null);
  const mapObjRef = useRef(null);
  const geocoderRef = useRef(null);
  const markersRef = useRef([]);
  const userLocationMarkerRef = useRef(null); // 사용자 위치 마커
  const regionPolygonsRef = useRef([]);
  const dongPolygonsRef = useRef([]);
  const [isMapReady, setIsMapReady] = useState(false);

  // 사용자 위치 마커 추가/업데이트 함수
  const addUserLocationMarker = (lat, lng) => {
    console.log('📍 addUserLocationMarker 호출됨:', lat, lng);
    console.log('📍 수원 위치 마커 생성 시도:', lat, lng);
    
    if (!kakaoRef.current || !mapObjRef.current) {
      console.log('❌ 카카오 맵 또는 지도 객체가 없음');
      return;
    }
    
    // 기존 사용자 위치 마커 제거
    if (userLocationMarkerRef.current) {
      console.log('📍 기존 마커 제거 중...');
      userLocationMarkerRef.current.setMap(null);
    }
    
    const position = new kakaoRef.current.maps.LatLng(lat, lng);
    console.log('📍 마커 위치 객체 생성:', position);
    
    // 사용자 위치 마커 생성 (더 명확한 파란색 원형 마커)
    const userMarker = new kakaoRef.current.maps.Marker({
      position: position,
      map: mapObjRef.current,
      zIndex: 2000, // 다른 마커보다 위에 표시
      image: new kakaoRef.current.maps.MarkerImage(
        'data:image/svg+xml;base64,' + btoa(`
          <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="14" fill="#4285F4" stroke="#ffffff" stroke-width="4"/>
            <circle cx="16" cy="16" r="6" fill="#ffffff"/>
            <circle cx="16" cy="16" r="3" fill="#4285F4"/>
          </svg>
        `),
        new kakaoRef.current.maps.Size(32, 32),
        new kakaoRef.current.maps.Point(16, 16)
      )
    });
    
    // 사용자 위치 인포윈도우
    const userInfoWindow = new kakaoRef.current.maps.InfoWindow({
      content: `
        <div style="padding: 8px; text-align: center; font-size: 12px; font-weight: bold; color: #333;">
          📍 현재 위치
        </div>
      `,
      removable: false,
      zIndex: 2001
    });
    
    // 마커 클릭 시 인포윈도우 표시
    kakaoRef.current.maps.event.addListener(userMarker, 'click', () => {
      userInfoWindow.open(mapObjRef.current, userMarker);
    });
    
    userLocationMarkerRef.current = userMarker;
    console.log('🎯 수원 위치 마커 추가 완료!:', lat, lng);
    console.log('🎯 마커가 지도에 표시되었는지 확인하세요!');
  };

  // 인기 문화지역 데이터
  const popularAreas = [
    { name: 'Daehangno', displayName: '대학로', lat: 37.5791, lng: 126.9990, type: 'theater' },
    { name: 'Hongdae', displayName: '홍대', lat: 37.5572, lng: 126.9244, type: 'gallery' },
    { name: 'Gangnam', displayName: '강남', lat: 37.4979, lng: 127.0276, type: 'museum' },
    { name: 'Insadong', displayName: '인사동', lat: 37.5735, lng: 126.9858, type: 'gallery' },
    { name: 'Samcheongdong', displayName: '삼청동', lat: 37.5847, lng: 126.9807, type: 'museum' },
  ];

  // 검색 및 카테고리 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [filteredSpots, setFilteredSpots] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // 문화시설 카테고리 목록 (테마에 맞는 색상으로 수정)
  const cultureCategories = [
    { key: 'theater', name: '극장', icon: '🎭', color: '#67C090' },
    { key: 'museum', name: '박물관', icon: '🏛️', color: '#26667F' },
    { key: 'gallery', name: '미술관', icon: '🖼️', color: '#7dd3a3' },
    { key: 'exhibition', name: '전시회', icon: '🎨', color: '#4A9B6E' },
    { key: 'concert', name: '콘서트홀', icon: '🎵', color: '#124170' },
    { key: 'cafe', name: '카페', icon: '☕', color: '#5A7A8A' }
  ];

  // 사용자 위치 및 문화시설 로딩 (통합된 useEffect) - 주석 처리
  /* useEffect(() => {
    if (!window.kakao || !window.kakao.maps) return;

    console.log('📍 사용자 현재 위치 요청 중...');
    
    const loadUserLocationAndPlaces = async () => {
      try {
        // 1. 먼저 사용자 위치 가져오기
        const userPos = await locationService.getCurrentLocation();
        console.log("🎯 GPS 성공! 실제 위치:", userPos);
        
        // 2. 상태 즉시 업데이트
        setUserLocation({ lat: userPos.lat, lng: userPos.lng });
        
        // 3. 지도가 준비되면 위치 설정
        if (mapObjRef.current && kakaoRef.current) {
          const userPosition = new kakaoRef.current.maps.LatLng(userPos.lat, userPos.lng);
          mapObjRef.current.setCenter(userPosition);
          mapObjRef.current.setLevel(3);
          
          // 기존 사용자 마커 제거 후 새로 추가
          if (userLocationMarkerRef.current) {
            userLocationMarkerRef.current.setMap(null);
          }
          addUserLocationMarker(userPos.lat, userPos.lng);
        }

        // 4. 문화시설 데이터 로드 (테스트 데이터 확실히 설정)
        const testPlaces = [
          {
            id: 'test1',
            name: '수원화성박물관',
            address: '경기도 수원시 팔달구 창룡대로 21',
            lat: userPos.lat + 0.01, // 사용자 위치 근처
            lng: userPos.lng + 0.01,
            category: '박물관',
            type: 'museum',
            phone: '031-228-4209',
            url: 'http://www.swcf.or.kr/?p=museum',
            rating: 4.2,
            reviewCount: 85,
            ratingCount: 100,
            distance: 1.2
          },
          {
            id: 'test2',
            name: '수원시립미술관',
            address: '경기도 수원시 영통구 이의동 산 94-6',
            lat: userPos.lat - 0.01,
            lng: userPos.lng + 0.01,
            category: '미술관',
            type: 'gallery',
            phone: '031-228-3800',
            url: 'http://suma.suwon.go.kr',
            rating: 4.0,
            reviewCount: 62,
            ratingCount: 80,
            distance: 0.8
          },
          {
            id: 'test3',
            name: '경기도박물관',
            address: '경기도 용인시 기흥구 상갈로 6',
            lat: userPos.lat + 0.02,
            lng: userPos.lng - 0.01,
            category: '박물관',
            type: 'museum',
            phone: '031-288-5300',
            url: 'https://museum.ggcf.kr',
            rating: 4.5,
            reviewCount: 120,
            ratingCount: 150,
            distance: 2.1
          }
        ];
        
        console.log('🎉 테스트 문화시설 데이터 설정:', testPlaces);
        setCultureSpots(testPlaces); // 확실히 설정
        setIsLoading(false);
        
      } catch (error) {
        console.error("❌ 위치 또는 데이터 로드 실패:", error);
        
        // 실패 시 기본값 설정하되, 여전히 테스트 데이터는 로드
        const defaultLocation = { lat: 37.5665, lng: 126.9780 };
        setUserLocation(defaultLocation);
        
        // 기본 위치 기준 테스트 데이터
        const defaultTestPlaces = [
          {
            id: 'default1',
            name: '국립중앙박물관',
            address: '서울특별시 용산구 서빙고로 137',
            lat: 37.5240,
            lng: 126.9803,
            category: '박물관',
            type: 'museum',
            phone: '02-2077-9000',
            rating: 4.6,
            reviewCount: 2840,
            distance: 4.2
          },
          {
            id: 'default2',
            name: '세종문화회관',
            address: '서울특별시 중구 세종대로 175',
            lat: 37.5720,
            lng: 126.9769,
            category: '공연장',
            type: 'theater',
            phone: '02-399-1000',
            rating: 4.3,
            reviewCount: 1250,
            distance: 0.8
          }
        ];
        
        setCultureSpots(defaultTestPlaces);
        setIsLoading(false);
      }
    };

    loadUserLocationAndPlaces();
  }, []); // 빈 dependency로 최초 1회만 실행 */

  // 🚀 통합된 지도 초기화 useEffect - 모든 초기화를 순차적으로 처리
  useEffect(() => {
    let mounted = true;
    
    const initEverything = async () => {
      try {
        console.log('[Map] 전체 초기화 시작...');
        
        // 1단계: 카카오 지도 로드
        const kakao = await loadKakao();
        if (!mounted || !mapRef.current) return;
        console.log('[Map] 카카오 SDK 로드 완료');
        kakaoRef.current = kakao;
        
        // 2단계: 사용자 위치 가져오기
        let userPos;
        try {
          userPos = await locationService.getCurrentLocation();
          console.log('[Map] GPS 성공:', userPos);
          
          // 중요: React 상태 즉시 업데이트
          setUserLocation({ lat: userPos.lat, lng: userPos.lng });
        } catch (error) {
          console.log('[Map] GPS 실패, 기본값 사용');
          userPos = { lat: 37.5665, lng: 126.978 };
          setUserLocation(userPos);
        }
        
        // 3단계: 지도 생성 (실제 위치로)
        mapObjRef.current = new kakao.maps.Map(mapRef.current, {
          center: new kakao.maps.LatLng(userPos.lat, userPos.lng),
          level: 3,
        });
        geocoderRef.current = new kakao.maps.services.Geocoder();
        
        console.log('[Map] 지도 생성 완료');
        
        // 4단계: 지도 준비 완료 대기
        await new Promise(resolve => {
          const checkReady = () => {
            if (mapObjRef.current?.getCenter) {
              console.log('[Map] 지도 준비 완료');
              setIsMapReady(true);
              resolve();
            } else {
              setTimeout(checkReady, 100);
            }
          };
          checkReady();
        });
        
        // 5단계: 사용자 마커 추가 및 지도 포커스
        addUserLocationMarker(userPos.lat, userPos.lng);
        
        // 5-1단계: 지도를 사용자 위치로 포커스 (부드러운 애니메이션)
        const userPosition = new kakao.maps.LatLng(userPos.lat, userPos.lng);
        
        // 부드러운 이동을 위한 애니메이션 옵션
        const moveOption = {
          center: userPosition,
          level: 3,
          animate: true,
          duration: 1000 // 1초 동안 부드럽게 이동
        };
        
        mapObjRef.current.setCenter(userPosition);
        mapObjRef.current.setLevel(3);
        
        // 인포윈도우는 마커 클릭 시에만 표시됨
        console.log('📍 사용자 위치 마커가 추가되었습니다. 마커를 클릭하면 위치 정보를 확인할 수 있습니다.');
        
        console.log('🎯 지도 포커스를 사용자 위치로 이동:', userPos);
        
        // 6단계: 테스트 문화시설 데이터 추가
        const testPlaces = [
          {
            id: 'test1',
            name: '수원화성박물관',
            address: '경기도 수원시 팔달구',
            lat: userPos.lat + 0.005,
            lng: userPos.lng + 0.005,
            category: '박물관',
            type: 'museum',
            rating: 4.2,
            reviewCount: 85,
            distance: 0.8
          },
          {
            id: 'test2',
            name: '수원시립미술관',
            address: '경기도 수원시 영통구',
            lat: userPos.lat - 0.005,
            lng: userPos.lng + 0.005,
            category: '미술관',
            type: 'gallery',
            rating: 4.0,
            reviewCount: 62,
            distance: 1.2
          }
        ];
        
        console.log('[Map] 테스트 데이터 설정:', testPlaces);
        setCultureSpots(testPlaces);
        setIsLoading(false);
        
        // 7단계: 서울 지도 초기화 (옵션)
        try {
          await initializeSeoulMap(kakao);
          console.log('[Map] 서울 지도 완료');
        } catch (err) {
          console.log('[Map] 서울 지도 실패 (무시)');
        }
        
      } catch (error) {
        console.error('[Map] 초기화 실패:', error);
        setIsLoading(false);
      }
    };

    initEverything();
    return () => { mounted = false; };
  }, []); // 한 번만 실행

  // 키워드에서 문화시설 유형 추출
  const getCultureTypeFromKeyword = (keyword) => {
    if (keyword.includes('극장') || keyword.includes('공연')) return 'theater';
    if (keyword.includes('박물관')) return 'museum';
    if (keyword.includes('미술관') || keyword.includes('갤러리')) return 'gallery';
    if (keyword.includes('전시')) return 'exhibition';
    if (keyword.includes('문화센터') || keyword.includes('아트센터')) return 'concert';
    if (keyword.includes('카페') || keyword.includes('커피')) return 'cafe';
    return 'theater';
  };

  // 카테고리에서 문화시설 유형 추출
  const getCultureTypeFromCategory = (category) => {
    if (!category) return 'theater';
    if (category.includes('극장') || category.includes('공연') || category.includes('연극')) return 'theater';
    if (category.includes('박물관') || category.includes('역사관') || category.includes('과학관')) return 'museum';
    if (category.includes('미술관') || category.includes('갤러리') || category.includes('아트센터')) return 'gallery';
    if (category.includes('전시') || category.includes('전시관') || category.includes('박람회')) return 'exhibition';
    if (category.includes('콘서트') || category.includes('공연장') || category.includes('음악회')) return 'concert';
    if (category.includes('카페') || category.includes('커피')) return 'cafe';
    return 'theater';
  };

  // 카테고리별 검색 함수
  const searchByCategory = async (categoryKey) => {
    setIsSearching(true);
    setSelectedCategory(categoryKey);
    
    try {
      // 카테고리별 키워드 매핑
      const categoryKeywords = {
        'theater': ['극장', '공연장', '연극', '뮤지컬'],
        'museum': ['박물관', '역사관', '과학관'],
        'gallery': ['미술관', '갤러리', '아트센터'],
        'exhibition': ['전시회', '전시관', '박람회'],
        'concert': ['콘서트홀', '공연장', '음악회'],
        'cafe': ['카페', '커피', '스타벅스', '이디야', '투썸플레이스']
      };
      
      const keywords = categoryKeywords[categoryKey] || ['문화시설'];
      let allSpots = [];
      
      // locationService를 사용하여 각 키워드로 검색
      for (const keyword of keywords) {
        try {
          const places = await locationService.searchPlacesByKeyword(keyword, 10000);
          const transformed = places.map((place) => ({
            id: place.id,
            name: place.name,
            address: place.address,
            lat: place.lat,
            lng: place.lng,
            detailUrl: place.url,
            phone: place.phone || '',
            type: categoryKey,
            description: place.category || '',
            hours: '운영시간 정보 없음',
            rating: place.rating || 0,
            reviewCount: place.reviewCount || 0,
            ratingCount: place.ratingCount || 0
          }));
          
          allSpots = [...allSpots, ...transformed];
        } catch (keywordError) {
          console.error(`키워드 "${keyword}" 검색 실패:`, keywordError);
        }
      }
      
      // 중복 제거
      const uniqueSpots = allSpots.filter((place, index, self) => 
        index === self.findIndex(p => p.id === place.id)
      );
      
      setFilteredSpots(uniqueSpots);
      setIsSearching(false);
      console.log(`🎉 ${categoryKey} 카테고리에서 ${uniqueSpots.length}개 장소 발견!`);
      
    } catch (error) {
      console.error('카테고리 검색 실패:', error);
      setIsSearching(false);
    }
  };

  // 일반 검색 함수
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    setSelectedCategory('');
    
    try {
      // locationService를 사용하여 검색
      const places = await locationService.searchPlacesByKeyword(searchQuery, 10000);
      
      const transformed = places.map((place) => ({
        id: place.id,
        name: place.name,
        address: place.address,
        lat: place.lat,
        lng: place.lng,
        detailUrl: place.url,
        phone: place.phone || '',
        type: getCultureTypeFromKeyword(searchQuery),
        description: place.category || '',
        hours: '운영시간 정보 없음',
        rating: place.rating || 0,
        reviewCount: place.reviewCount || 0,
        ratingCount: place.ratingCount || 0
      }));
      
      setFilteredSpots(transformed);
      setIsSearching(false);
      console.log(`🔍 '${searchQuery}' 검색 결과: ${transformed.length}개`);
      
    } catch (error) {
      console.error('검색 실패:', error);
      setIsSearching(false);
    }
  };

  // Kakao SDK 로딩 함수
  const loadKakao = () =>
    new Promise((resolve, reject) => {
      if (window.kakao && window.kakao.maps) return resolve(window.kakao);

      const exist = document.querySelector('script[data-kakao="true"]');
      if (!exist) {
        const s = document.createElement('script');
        s.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=305a989699c2b85d2d6470b6376d3853&autoload=false&libraries=services';
        s.async = true;
        s.dataset.kakao = 'true';
        s.onerror = () => {
          console.error('❌ Kakao Maps SDK 로딩 실패');
          console.error('❌ 가능한 원인:');
          console.error('   1. HTTPS가 아닌 환경에서 접속');
          console.error('   2. Kakao 개발자 센터에서 도메인 미등록');
          console.error('   3. 네트워크 연결 문제');
          reject(new Error('Failed to load Kakao Maps SDK'));
        };
        document.head.appendChild(s);
      }

      const onReady = () => {
        if (window.kakao && window.kakao.maps) {
          window.kakao.maps.load(() => resolve(window.kakao));
        } else {
          console.error('❌ Kakao Maps SDK 로딩 후에도 사용할 수 없음');
          reject(new Error('Kakao Maps SDK not available after loading'));
        }
      };
      
      // 이미 붙어있으면 onload만 걸고, 없으면 위에서 붙인 스크립트가 load되면 호출
      (exist || document.querySelector('script[data-kakao="true"]')).addEventListener('load', onReady, { once: true });
    });

  // 지도 초기화: 최초 1회 - 주석 처리
  /* useEffect(() => {
    let mounted = true;
    
    (async () => {
      try {
        console.log('[Map] Starting map initialization...');
        const kakao = await loadKakao();
        if (!mounted || !mapRef.current) return;

        console.log('[Map] Kakao SDK loaded, creating map...');
        kakaoRef.current = kakao;
        
        // 사용자 위치를 가져와서 지도 중심 설정
        try {
          const userPos = await locationService.getCurrentLocation();
          console.log('[Map] 사용자 위치로 지도 초기화:', userPos);
          mapObjRef.current = new kakao.maps.Map(mapRef.current, {
            center: new kakao.maps.LatLng(userPos.lat, userPos.lng),
            level: 3, // 더 가까운 줌 레벨
          });
        } catch (error) {
          console.log('[Map] 사용자 위치 가져오기 실패, 기본 위치로 지도 초기화:', error);
          mapObjRef.current = new kakao.maps.Map(mapRef.current, {
            center: new kakao.maps.LatLng(37.5665, 126.978),
            level: 9,
          });
        }
        geocoderRef.current = new kakao.maps.services.Geocoder();

        console.log('[Map] Map initialized successfully');
        console.log('[Map] Map object:', mapObjRef.current);
        console.log('[Map] Geocoder object:', geocoderRef.current);

        // 지도가 완전히 로드될 때까지 대기 (더 안정적인 방법)
        await new Promise(resolve => {
          const checkMapReady = () => {
            if (mapObjRef.current && mapObjRef.current.getCenter && mapObjRef.current.getLevel) {
              console.log('[Map] Map is fully ready, setting isMapReady to true');
              setIsMapReady(true);
              resolve();
            } else {
              console.log('[Map] Map not ready yet, retrying...');
              setTimeout(checkMapReady, 100);
            }
          };
          checkMapReady();
        });
        
        // 서울 지도 데이터 로딩 및 구/동 폴리곤 그리기
        console.log('[Map] Starting Seoul map initialization...');
        try {
          await initializeSeoulMap(kakao);
          console.log('[Map] Seoul map initialization completed');
        } catch (seoulErr) {
          console.error('[Map] Seoul map initialization failed:', seoulErr);
          console.log('[Map] Continuing with basic map display...');
          // 서울 지도 초기화 실패 시에도 기본 지도는 계속 표시
        }
      } catch (err) {
        console.error('Map init error:', err);
        console.log('📍 지도 초기화 실패, 기본 기능만 활성화');
        
        // 지도 초기화 실패 시에도 기본 기능은 작동하도록 설정
        setIsMapReady(true);
        setIsLoading(false);
      }
    })().catch(err => console.error('Map init error:', err));

    return () => { mounted = false; };
  }, []); */

  // 서울 지도 초기화 함수
  const initializeSeoulMap = async (kakao) => {
    try {
      console.log('[Map] Loading Seoul map data...');
      
      // 지도 데이터 로딩
      const [seoulMap, dongDataRaw] = await Promise.all([
        fetch('/seoul.geojson').then(res => {
          if (!res.ok) throw new Error(`Failed to load seoul.geojson: ${res.status}`);
          return res.json();
        }),
        fetch('/seoul_districts_topo.json').then(res => {
          if (!res.ok) throw new Error(`Failed to load seoul_districts_topo.json: ${res.status}`);
          return res.json();
        })
      ]);

      console.log('[Map] Seoul map data loaded successfully');
      console.log('[Map] Seoul map features:', seoulMap?.features?.length);
      console.log('[Map] Dong data features:', dongDataRaw?.objects?.admdong_seoul_codeEdit_1?.geometries?.length);

      const dongData = feature(dongDataRaw, dongDataRaw.objects.admdong_seoul_codeEdit_1);
      const map = mapObjRef.current;

      // 데이터 유효성 검증
      if (!seoulMap?.features || !dongData?.features) {
        console.error('[Map] Invalid map data structure');
        throw new Error('Invalid map data structure');
      }

      console.log('[Map] Creating map overlays...');
      const customOverlay = new kakao.maps.CustomOverlay({});
      const infowindow = new kakao.maps.InfoWindow({ removable: true });

      // popularAreas에서 좌표 정보 가져오기
      const centers = popularAreas;

      // 동 지역 표시 함수
      const displayDongAreas = (dongGeo) => {
        dongGeo.forEach((dong) => {
          const geometry = dong.geometry;
          const drawPolygon = (coords) => {
            const path = coords.map(([lng, lat]) => new kakao.maps.LatLng(lat, lng));
                         const polygon = new kakao.maps.Polygon({
               map,
               path,
               strokeWeight: 2,
              strokeColor: '#26667F',
              strokeOpacity: 0.8,
              fillColor: '#67C090',
              fillOpacity: 0.08,
             });
            dongPolygonsRef.current.push(polygon);
            addDongEvents(polygon, dong, kakao, map, infowindow, customOverlay);
          };

          if (geometry.type === 'Polygon') drawPolygon(geometry.coordinates[0]);
          else if (geometry.type === 'MultiPolygon')
            geometry.coordinates.forEach((multi) => drawPolygon(multi[0]));
        });
      };

      // 동 지역 이벤트 추가
      const addDongEvents = (polygon, dong, kakao, map, infowindow, customOverlay) => {
        kakao.maps.event.addListener(polygon, 'mouseover', (e) => {
          polygon.setOptions({ fillColor: '#7dd3a3' });
          polygon.setOptions({fillOpacity: 0.2});
          customOverlay.setPosition(e.latLng);
          customOverlay.setMap(map);
        });
        kakao.maps.event.addListener(polygon, 'mouseout', () => {
          polygon.setOptions({ fillColor: '#67C090' });
          polygon.setOptions({fillOpacity: 0.08});
          customOverlay.setMap(null);
        });
        kakao.maps.event.addListener(polygon, 'click', (e) => {
          const content = document.createElement('div');
          content.innerHTML = `
            <div style="padding:8px; font-size:13px;">
              <strong>${dong.properties.DONG_KOR_NM}</strong><br/>
              이 지역 맛집을 보시겠어요?<br/><br/>
              <button id="btn-goto" style="background:#67C090;color:white;padding:4px 8px;border-radius:5px;border:none;font-weight:600;">맛집 보기</button>
            </div>`;
          infowindow.setContent(content);
          infowindow.setPosition(e.latLng);
          infowindow.setMap(map);
          content.querySelector('#btn-goto')?.addEventListener('click', () => {
            navigate('/restaurant');
          });
          addGoBackButton(kakao, map, dongData, seoulMap, centers);
        });
      };

      // 구 지역 표시 함수
      const displayArea = (coords, name) => {
        const path = coords.map(([lng, lat]) => new kakao.maps.LatLng(lat, lng));
        const polygon = new kakao.maps.Polygon({
          map,
          path,
          strokeWeight: 2,
          strokeColor: '#26667F',
          strokeOpacity: 0.8,
          fillColor: '#DDF4E7',
          fillOpacity: 0.7,
        });
        regionPolygonsRef.current.push(polygon);

        kakao.maps.event.addListener(polygon, 'mouseover', (e) => {
          polygon.setOptions({ fillColor: '#7dd3a3' });
          customOverlay.setPosition(e.latLng);
          customOverlay.setMap(map);
        });
        kakao.maps.event.addListener(polygon, 'mouseout', () => {
          polygon.setOptions({ fillColor: '#DDF4E7' });
          customOverlay.setMap(null);
        });
        kakao.maps.event.addListener(polygon, 'click', () => {
          // 구 테두리는 유지하고 동 레벨로만 확대
          const center = centers.find((c) => c.name === name);
          if (center)
            map.setCenter(new kakao.maps.LatLng(center.lat, center.lng));
          map.setLevel(7);
          const dongs = dongData.features.filter(
            (f) => f.properties.SIG_KOR_NM === name,
          );
          displayDongAreas(dongs);
          addGoBackButton(kakao, map, dongData, seoulMap, centers);
        });
      };

      // 뒤로가기 버튼 추가
      const addGoBackButton = (kakao, map, dongData, seoulMap, centers) => {
        let goBackButton = document.querySelector('#go-back-btn');
        if (goBackButton) return;
        
        goBackButton = document.createElement('button');
        goBackButton.id = 'go-back-btn';
        goBackButton.innerText = '구 다시 선택하기';
        goBackButton.style.cssText =
          'position:absolute;top:20px;right:40px;background:#67C090;color:white;padding:10px 16px;border-radius:8px;z-index:100;border:none;font-weight:600;box-shadow:0 4px 12px rgba(103, 192, 144, 0.3);';
        goBackButton.onclick = () => resetRegions(kakao, map, dongData, seoulMap);
        document.body.appendChild(goBackButton);
      };

      // 지역 초기화 함수
      const resetRegions = (kakao, map, dongData, seoulMap) => {
        // 동 폴리곤 제거
        dongPolygonsRef.current.forEach((p) => p.setMap(null));
        dongPolygonsRef.current = [];
        
        // 구 폴리곤 다시 표시 (기존 폴리곤들을 다시 활성화)
        regionPolygonsRef.current.forEach((p) => p.setMap(map));
        
        infowindow.close();
        map.setLevel(9);
        map.setCenter(new kakao.maps.LatLng(37.5665, 126.9780));
        
        const goBackButton = document.querySelector('#go-back-btn');
        if (goBackButton) {
          goBackButton.remove();
        }
        
        seoulMap.features.forEach((f) => {
          displayArea(f.geometry.coordinates[0], f.properties.SIG_KOR_NM);
        });
      };

      // 초기 구 지역 표시
      seoulMap.features.forEach((f) => {
        displayArea(f.geometry.coordinates[0], f.properties.SIG_KOR_NM);
      });

    } catch (err) {
      console.error('Seoul map initialization error:', err);
    }
  };

  // 추천 기능 실행
  const generateRecommendations = () => {
    console.log('🎯 추천 버튼 클릭됨!');
    console.log('현재 상태:', {
      userLocation,
      cultureSpotsCount: cultureSpots.length,
      cultureSpots: cultureSpots
    });
    
    if (!userLocation || cultureSpots.length === 0) {
      console.log('사용자 위치 또는 문화시설 데이터가 없습니다.');
      console.log('테스트용 더미 데이터로 추천 실행...');
      
      // 테스트용 더미 데이터
      const dummySpots = [
        {
          id: 'test1',
          name: '테스트 극장',
          address: '서울특별시 중구',
          lat: 37.5665,
          lng: 126.9780,
          rating: 4.2,
          reviewCount: 15,
          ratingCount: 20,
          type: 'theater'
        },
        {
          id: 'test2', 
          name: '테스트 박물관',
          address: '서울특별시 중구',
          lat: 37.5675,
          lng: 126.9790,
          rating: 3.8,
          reviewCount: 8,
          ratingCount: 12,
          type: 'museum'
        },
        {
          id: 'test3',
          name: '테스트 미술관', 
          address: '서울특별시 중구',
          lat: 37.5685,
          lng: 126.9800,
          rating: 4.0,
          reviewCount: 12,
          ratingCount: 18,
          type: 'gallery'
        }
      ];
      
      const recommendations = rankPlaces(userLocation.lat, userLocation.lng, dummySpots);
      const formattedRecommendations = formatRecommendation(recommendations);
      
      console.log('더미 데이터 추천 결과:', formattedRecommendations);
      setRecommendedPlaces(formattedRecommendations);
      setShowRecommendations(true);
      return;
    }
    
    console.log('🎯 추천 알고리즘 실행 중...');
    console.log('사용자 위치:', userLocation);
    console.log('문화시설 수:', cultureSpots.length);
    
    const recommendations = rankPlaces(userLocation.lat, userLocation.lng, cultureSpots);
    const formattedRecommendations = formatRecommendation(recommendations);
    
    console.log('추천 결과:', formattedRecommendations);
    setRecommendedPlaces(formattedRecommendations);
    setShowRecommendations(true);
  };

  // 추천 결과 초기화
  const resetRecommendations = () => {
    setRecommendedPlaces([]);
    setShowRecommendations(false);
  };

  // 검색 초기화 함수
  const resetSearch = () => {
    setSearchQuery('');
    setSelectedCategory('');
    setFilteredSpots([]);
  };

  // 인기지역 클릭 시 해당 지역으로 지도 이동
  const focusOnArea = (area) => {
    if (!mapObjRef.current) return;
    
    const map = mapObjRef.current;
    const position = new kakaoRef.current.maps.LatLng(area.lat, area.lng);
    
    // 지도 중심을 해당 지역으로 이동
    map.setCenter(position);
    // 적절한 줌 레벨로 설정
    map.setLevel(6);
    
    // 해당 지역에 마커 추가 (선택된 지역 표시)
    const marker = new kakaoRef.current.maps.Marker({
      position: position,
      map: map,
      zIndex: 2000
    });
    
    // 3초 후 마커 제거
    setTimeout(() => {
      marker.setMap(null);
    }, 3000);
  };

  // 사용자 위치가 변경될 때마다 마커 업데이트 - 주석 처리 (통합 useEffect에서 처리)
  /* useEffect(() => {
    if (!userLocation || !isMapReady || !kakaoRef.current || !mapObjRef.current) {
      return;
    }
    
    console.log('📍 사용자 위치 변경됨, 마커 업데이트:', userLocation);
    
    // 기존 마커 제거
    if (userLocationMarkerRef.current) {
      userLocationMarkerRef.current.setMap(null);
    }
    
    // 새 마커 추가
    addUserLocationMarker(userLocation.lat, userLocation.lng);
    
    // 지도 중심 이동
    const userPosition = new kakaoRef.current.maps.LatLng(userLocation.lat, userLocation.lng);
    mapObjRef.current.setCenter(userPosition);
    mapObjRef.current.setLevel(3);
    
  }, [userLocation, isMapReady]); // userLocation이 변경될 때마다 실행 */

  // 마커 갱신: cultureSpots 또는 filteredSpots가 바뀔 때마다
  useEffect(() => {
    console.log('[Map] Marker update effect triggered');
    console.log('[Map] cultureSpots data:', cultureSpots);
    console.log('[Map] cultureSpots length:', cultureSpots?.length);
    console.log('[Map] filtered spots length:', filteredSpots?.length);
    console.log('[Map] isMapReady:', isMapReady);
    
    const kakao = kakaoRef.current;
    const map = mapObjRef.current;
    const geocoder = geocoderRef.current;
    
    console.log('[Map] kakao ref:', !!kakao);
    console.log('[Map] map ref:', !!map);
    console.log('[Map] geocoder ref:', !!geocoder);
    console.log('[Map] map object details:', map);
    
    // 지도가 완전히 준비되었는지 확인
    if (!kakao || !map || !geocoder || !Array.isArray(cultureSpots) || !isMapReady) {
      console.log('[Map] Early return - missing dependencies or map not ready');
      console.log('[Map] Missing: kakao=', !kakao, 'map=', !map, 'geocoder=', !geocoder, 'cultureSpots=', !Array.isArray(cultureSpots), 'isMapReady=', !isMapReady);
      return;
    }
    
    console.log('[Map] All dependencies ready, proceeding with marker creation');

    // 기존 마커 제거
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    const toLatLng = (lat, lng) => new kakao.maps.LatLng(Number(lat), Number(lng));
    
    const addMarker = (spot, position) => {
      // 마커 생성
      const marker = new kakao.maps.Marker({ 
        position, 
        map,
        // 마커 스타일 개선
        zIndex: 1000
      });
      
      // 문화시설 유형별 아이콘
      const getTypeIcon = (type) => {
        switch(type) {
          case 'theater': return '🎭';
          case 'museum': return '🏛️';
          case 'gallery': return '🖼️';
          case 'exhibition': return '🎨';
          case 'concert': return '🎵';
          default: return '📍';
        }
      };
      
      // 인포윈도우 내용
      const html = `
        <div style="padding:12px; min-width:250px; background:linear-gradient(135deg, #1a1a1a, #2a2a2a); border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.3); border:1px solid #67C090;">
          <h4 style="margin:0 0 8px 0; color:#67C090; font-size:16px; font-weight:600;">${getTypeIcon(spot.type)} ${spot.name || 'Untitled'}</h4>
          <div style="font-size:13px;color:#DDF4E7; margin-bottom:6px;">📍 ${spot.address || ''}</div>
          ${spot.hours ? `<div style="font-size:12px;color:#7dd3a3; margin-bottom:6px;">🕒 ${spot.hours}</div>` : ''}
          ${spot.type ? `<div style="font-size:12px;color:#7dd3a3; margin-bottom:8px;">${getTypeIcon(spot.type)} ${spot.type}</div>` : ''}
          <a href="#" style="display:inline-block;background:#67C090;color:#fff;padding:6px 12px;border-radius:6px;text-decoration:none;font-size:12px;font-weight:600;border:none;box-shadow:0 2px 8px rgba(103, 192, 144, 0.3);">상세보기</a>
        </div>`;
      
      const infowindow = new kakao.maps.InfoWindow({ 
        content: html, 
        removable: true,
        zIndex: 1001
      });
      
      // 마커 클릭 이벤트
      kakao.maps.event.addListener(marker, 'click', () => {
        // 기존에 열려있는 모든 인포윈도우 닫기
        markersRef.current.forEach(m => {
          if (m.infowindow) {
            m.infowindow.close();
          }
        });
        
        // 현재 마커의 인포윈도우 열기
        infowindow.open(map, marker);
        
        // 마커에 인포윈도우 참조 저장
        marker.infowindow = infowindow;
      });
      
      markersRef.current.push(marker);
      console.log('[Map] Marker created for:', spot.name, 'at position:', position);
    };

    const bounds = new kakao.maps.LatLngBounds();

    (async () => {
      // 필터링된 결과가 있으면 그것을 사용, 없으면 전체 cultureSpots 사용
      const spotsToShow = filteredSpots.length > 0 ? filteredSpots : cultureSpots;
      console.log('[Map] Starting marker creation for', spotsToShow.length, 'culture spots');
      console.log('[Map] Map object at marker creation:', map);
      console.log('[Map] Geocoder object at marker creation:', geocoder);
      
      try {
        console.log('[Map] Total culture spots to process:', spotsToShow.length);
        for (const spot of spotsToShow) {
           console.log('[Map] Processing culture spot:', spot.name);
           console.log('[Map] Location data:', {
             lat: spot.lat,
             lng: spot.lng,
             address: spot.address
           });
           console.log('[Map] Location type check:', {
             hasLat: spot.lat != null,
             hasLng: spot.lng != null,
             latValue: spot.lat,
             lngValue: spot.lng,
             hasAddress: !!spot.address,
             addressValue: spot.address
           });
          
                     // 좌표가 유효한 경우 (0이 아닌 값)
           if (spot.lat && spot.lng && spot.lat !== 0 && spot.lng !== 0) {
             console.log('[Map] Using lat/lng:', spot.lat, spot.lng);
             try {
               const pos = toLatLng(spot.lat, spot.lng);
               addMarker(spot, pos);
               bounds.extend(pos);
               console.log('[Map] Marker added with coordinates');
             } catch (markerErr) {
               console.error('[Map] Failed to create marker for coordinates:', spot.lat, spot.lng, markerErr);
             }
           } 
           // 주소가 있는 경우 지오코딩
           else if (spot.address && spot.address.trim()) {
             console.log('[Map] Geocoding address:', spot.address);
             try {
               const pos = await new Promise(resolve => {
                 geocoder.addressSearch(spot.address, (result, status) => {
                   console.log('[Map] Geocoding result:', status, result);
                   if (status === kakao.maps.services.Status.OK && result[0]) {
                     resolve(toLatLng(result[0].y, result[0].x)); // y=lat, x=lng
                   } else {
                     console.log('[Map] Geocoding failed, status:', status);
                     resolve(null);
                   }
                 });
               });
               if (pos) {
                 addMarker(spot, pos);
                 bounds.extend(pos);
                 console.log('[Map] Marker added with geocoded position');
               } else {
                 console.log('[Map] Geocoding failed for:', spot.address);
               }
             } catch (geocodeErr) {
               console.error('[Map] Geocoding error for address:', spot.address, geocodeErr);
             }
           } 
           // 위치 정보가 없는 경우
           else {
             console.log('[Map] No valid location data for:', spot.name, 'location:', spot.address);
           }
        }
        
                 console.log('[Map] Total markers created:', markersRef.current.length);
         
         // 디버깅용: 테스트 마커 추가 (서울 시청)
         if (markersRef.current.length === 0) {
           console.log('[Map] No markers created, adding test marker at Seoul City Hall');
           const testPosition = new kakao.maps.LatLng(37.5665, 126.978);
           const testMarker = new kakao.maps.Marker({ 
             position: testPosition, 
             map,
             zIndex: 1000
           });
           markersRef.current.push(testMarker);
           bounds.extend(testPosition);
           console.log('[Map] Test marker added');
         }
         
         if (!bounds.isEmpty()) {
           map.setBounds(bounds);
           console.log('[Map] Map bounds updated');
         }
      } catch (err) {
        console.error('[Map] Error during marker creation:', err);
      }
    })();
     }, [cultureSpots, filteredSpots, isMapReady]);

  // 디버깅용 렌더링 확인
  console.log('[Map] Component rendering, cultureSpots:', cultureSpots?.length, 'isMapReady:', isMapReady);
  console.log('[Map] User location:', userLocation);
  console.log('[Map] AI 추천 버튼 활성화 조건:', {
    hasUserLocation: !!userLocation,
    hasCultureSpots: cultureSpots?.length > 0,
    canRecommend: !!(userLocation && cultureSpots?.length > 0)
  });

  return (
    <div className="map-page">
      <Topnav />

      <div className="map-header-text">
        <h2>문화시설 지도</h2>
        <p>근처 문화시설(극장/미술관/박물관)을 찾아보세요.</p>
        {/* 디버깅용 상태 표시 */}
        {/* <div style={{fontSize: '12px', color: '#666', marginTop: '10px'}}>
          Debug: Plays: {plays?.length || 0}, Map Ready: {isMapReady ? 'Yes' : 'No'}
        </div> */}
      </div>

      <div className="map-content">
        <aside className="map-filter">
          <h4>검색 및 카테고리</h4>
          
          {/* 검색 섹션 */}
          <div className="search-section">
          <input 
            type="text" 
              placeholder="문화시설명 또는 지역을 검색해 보세요" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button 
              className="search-btn" 
              onClick={handleSearch}
              disabled={isSearching}
            >
              {isSearching ? '검색중...' : '🔍 검색'}
            </button>
          </div>
          
          {/* 카테고리 버튼 섹션 */}
          <div className="category-section">
            <h5>카테고리별 검색</h5>
            <div className="category-buttons">
              {cultureCategories.map((category) => (
                <button
                  key={category.key}
                  className={`category-btn ${selectedCategory === category.key ? 'active' : ''}`}
                  data-category={category.key}
                  onClick={() => searchByCategory(category.key)}
                  disabled={isSearching}
                >
                  <span className="category-icon">{category.icon}</span>
                  <span className="category-name">{category.name}</span>
                </button>
              ))}
            </div>
          </div>
          
          {/* 추천 버튼 */}
          <div className="recommendation-section">
            <button 
              className="recommend-btn" 
              onClick={generateRecommendations}
              disabled={false}
              style={{
                backgroundColor: '#67C090',
                color: 'white',
                padding: '12px 20px',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                opacity: 1,
                width: '100%',
                marginBottom: '10px'
              }}
            >
              🎯 AI 추천 받기
            </button>
            {showRecommendations && (
              <button 
                className="reset-recommend-btn" 
                onClick={resetRecommendations}
                style={{
                  backgroundColor: '#ff6b6b',
                  color: 'white',
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  width: '100%'
                }}
              >
                ✖️ 추천 닫기
              </button>
            )}
          </div>

          {/* 초기화 버튼 */}
          <div className="reset-section">
            <button className="reset-btn" onClick={resetSearch}>
              🔄 초기화
            </button>
          </div>

          {/* <div className="popular-areas">
            <h4>인기 지역</h4>
            <ul>
              {popularAreas.map((area, i) => (
                <li 
                  key={i} 
                  onClick={() => focusOnArea(area)}
                  style={{ cursor: 'pointer', padding: '8px', borderRadius: '4px', transition: 'background-color 0.2s' }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(103, 192, 144, 0.15)'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                >
                  📍 {area.displayName}
                </li>
              ))}
            </ul>
          </div> */}
        </aside>

        <div className="map-container-wrapper">
          <div ref={mapRef} className="map-container" />
          {!isMapReady && (
            <div className="map-loading-overlay">
              <div className="map-loading-spinner">지도를 불러오는 중...</div>
            </div>
          )}
        </div>
      </div>

      {/* 필터 결과 표시 (필터를 적용했을 때만 표시) */}
      {filteredSpots.length > 0 && (
        <section className="filter-results">
          <h4>검색 결과 ({filteredSpots.length}개)</h4>
          <div className="experience-list">
            {filteredSpots.map((spot, index) => (
              <div key={`filtered-${spot.id || spot.name || index}-${index}`} className="exp-card">
                                  <div className="exp-info">
                  <h5>{spot.name}</h5>
                  <p>{spot.address || '주소 정보 없음'}</p>
                  {spot.type && (
                    <p className="category">
                      {spot.type === 'theater' && '🎭 극장'}
                      {spot.type === 'museum' && '🏛️ 박물관'}
                      {spot.type === 'gallery' && '🖼️ 미술관'}
                      {spot.type === 'exhibition' && '🎨 전시회'}
                      {spot.type === 'concert' && '🎵 콘서트홀'}
                      {spot.type === 'cafe' && '☕ 카페'}
                    </p>
                  )}
                  {spot.hours && <p className="hours">🕒 {spot.hours}</p>}
                  </div>
                <a 
                  href={spot.detailUrl || '#'} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="view-btn"
                >
                  상세보기
                </a>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* AI 추천 결과 표시 */}
      {showRecommendations && recommendedPlaces.length > 0 && (
        <section className="recommendation-results">
          <h4>🎯 AI 추천 결과 ({recommendedPlaces.length}개)</h4>
          <div className="recommendation-list">
            {recommendedPlaces.map((place, index) => (
              <div key={`recommended-${place.name || place.rank || index}-${index}`} className="recommendation-card">
                <div className="recommendation-rank">
                  <span className="rank-number">{place.rank}</span>
                </div>
                <div className="recommendation-info">
                  <h5>{place.name}</h5>
                  <p className="recommendation-address">📍 {place.address}</p>
                  <div className="recommendation-details">
                    <span className="rating">⭐ {place.rating}/5.0</span>
                    <span className="reviews">💬 {place.reviewCount}개 리뷰</span>
                    <span className="distance">🚶‍♂️ {place.distance}</span>
                  </div>
                  <div className="recommendation-score">
                    <small>추천 점수: {place.score}</small>
                  </div>
                </div>
                <div className="recommendation-actions">
                  <a 
                    href={place.detailUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="view-detail-btn"
                  >
                    상세보기
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 필터를 적용하지 않았을 때는 아무것도 표시하지 않음 */}
      {filteredSpots.length === 0 && !showRecommendations && (
        <div className="no-filter-message">
          <p>검색 조건을 설정하거나 "AI 추천 받기"를 클릭하여 문화시설을 찾아보세요.</p>
        </div>
      )}
    </div>
  );
};

export default Map;