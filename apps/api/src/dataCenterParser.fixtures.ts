const abilities = [
  ["속력", 120], ["가속력", 119], ["골 결정력", 121], ["슛 파워", 118], ["중거리 슛", 117],
  ["짧은 패스", 116], ["긴 패스", 112], ["드리블", 120], ["볼 컨트롤", 119], ["민첩성", 115],
].map(([label, value]) => `<li class="ab"><div class="txt">${label}</div><div class="value up">${value}</div></li>`).join("");

export const VALID_PLAYER_ABILITY_HTML = `
<div class="name">테스트 선수</div>
<div class="ovr value">123</div>
<div class="position">ST</div>
<div class="pay"><span>28</span></div>
<span class="etc foot">L 5 R 5</span>
<span class="etc skill"><span>★★★★★</span></span>
<div class="etc nation"><span class="txt">대한민국</span></div>
<div class="height">180cm</div><div class="weight">75kg</div><div class="physical">보통</div>
<div class="content_middle"><li class="ab"><div class="txt">속력</div><div class="value">120</div></li></div>
<div class="ovr_set"><div class="position st value">123</div><div class="position cf value">121</div></div></div>
<div class="content_bottom">${abilities}</div>
<div class="skill_wrap"><span class="desc">예리한 감아차기</span><div class="en_selector_wrap"></div>
`;

export const PARTIAL_PLAYER_ABILITY_HTML = VALID_PLAYER_ABILITY_HTML
  .replace('<div class="height">180cm</div>', "")
  .replace('<div class="etc nation"><span class="txt">대한민국</span></div>', "");

export const BROKEN_PLAYER_ABILITY_HTML = '<div class="name">테스트 선수</div><div class="content_bottom"></div>';
