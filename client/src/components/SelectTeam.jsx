//select team, gives user the ability to select NBA teams.
import React, { useState } from 'react';

// Example data structure for teams and players
const teamsData = [
  {
    name: 'Atlanta Hawks',
    players: [
      'Trae Young', 'Dejounte Murray', 'Clint Capela', 'Bogdan Bogdanović', 'De\'Andre Hunter',
      'Saddiq Bey', 'Onyeka Okongwu', 'AJ Griffin', 'Garrison Mathews', 'Bruno Fernando',
      'Wesley Matthews', 'Vit Krejci'
    ],
  },
  {
    name: 'Boston Celtics',
    players: [
      'Jayson Tatum', 'Jaylen Brown', 'Kristaps Porziņģis', 'Derrick White', 'Al Horford',
      'Jrue Holiday', 'Payton Pritchard', 'Sam Hauser', 'Luke Kornet', 'Oshae Brissett',
      'Neemias Queta', 'Svi Mykhailiuk'
    ],
  },
  {
    name: 'Brooklyn Nets',
    players: [
      'Mikal Bridges', 'Cam Thomas', 'Nic Claxton', 'Dennis Schröder', 'Dorian Finney-Smith',
      'Day\'Ron Sharpe', 'Lonnie Walker IV', 'Dennis Smith Jr.', 'Cam Johnson', 'Noah Clowney',
      'Trendon Watford', 'Jalen Wilson'
    ],
  },
  {
    name: 'Charlotte Hornets',
    players: [
      'LaMelo Ball', 'Terry Rozier', 'Gordon Hayward', 'Miles Bridges', 'Mark Williams',
      'Brandon Miller', 'Nick Richards', 'JT Thor', 'Bryce McGowens', 'Cody Martin',
      'Vasilije Micić', 'Tre Mann'
    ],
  },
  {
    name: 'Chicago Bulls',
    players: [
      'Zach LaVine', 'DeMar DeRozan', 'Nikola Vučević', 'Coby White', 'Patrick Williams',
      'Alex Caruso', 'Ayo Dosunmu', 'Andre Drummond', 'Jevon Carter', 'Torrey Craig',
      'Julian Phillips', 'Dalen Terry'
    ],
  },
  {
    name: 'Cleveland Cavaliers',
    players: [
      'Donovan Mitchell', 'Darius Garland', 'Evan Mobley', 'Jarrett Allen', 'Caris LeVert',
      'Max Strus', 'Isaac Okoro', 'Georges Niang', 'Dean Wade', 'Sam Merrill',
      'Damian Jones', 'Craig Porter Jr.'
    ],
  },
  {
    name: 'Dallas Mavericks',
    players: [
      'Luka Dončić', 'Kyrie Irving', 'Derrick Jones Jr.', 'P.J. Washington', 'Daniel Gafford',
      'Tim Hardaway Jr.', 'Josh Green', 'Maxi Kleber', 'Dwight Powell', 'Dante Exum',
      'Jaden Hardy', 'Markieff Morris'
    ],
  },
  {
    name: 'Denver Nuggets',
    players: [
      'Nikola Jokić', 'Jamal Murray', 'Michael Porter Jr.', 'Aaron Gordon', 'Kentavious Caldwell-Pope',
      'Reggie Jackson', 'Christian Braun', 'Peyton Watson', 'Zeke Nnaji', 'Justin Holiday',
      'DeAndre Jordan', 'Julian Strawther'
    ],
  },
  {
    name: 'Detroit Pistons',
    players: [
      'Cade Cunningham', 'Jaden Ivey', 'Jalen Duren', 'Ausar Thompson', 'Isaiah Stewart',
      'Marvin Bagley III', 'James Wiseman', 'Alec Burks', 'Killian Hayes', 'Simone Fontecchio',
      'Quentin Grimes', 'Evan Fournier'
    ],
  },
  {
    name: 'Golden State Warriors',
    players: [
      'Stephen Curry', 'Klay Thompson', 'Draymond Green', 'Andrew Wiggins', 'Jonathan Kuminga',
      'Kevon Looney', 'Gary Payton II', 'Brandin Podziemski', 'Moses Moody', 'Trayce Jackson-Davis',
      'Dario Šarić', 'Lester Quinones'
    ],
  },
  {
    name: 'Houston Rockets',
    players: [
      'Jalen Green', 'Fred VanVleet', 'Alperen Şengün', 'Dillon Brooks', 'Jabari Smith Jr.',
      'Amen Thompson', 'Cam Whitmore', 'Tari Eason', 'Jock Landale', 'Aaron Holiday',
      'Jeff Green', 'Reggie Bullock'
    ],
  },
  {
    name: 'Indiana Pacers',
    players: [
      'Tyrese Haliburton', 'Myles Turner', 'Pascal Siakam', 'Bennedict Mathurin', 'Aaron Nesmith',
      'Andrew Nembhard', 'Obi Toppin', 'Jalen Smith', 'Isaiah Jackson', 'T.J. McConnell',
      'Doug McDermott', 'Ben Sheppard'
    ],
  },
  {
    name: 'LA Clippers',
    players: [
      'Kawhi Leonard', 'Paul George', 'James Harden', 'Ivica Zubac', 'Russell Westbrook',
      'Norman Powell', 'Terance Mann', 'Mason Plumlee', 'Bones Hyland', 'Amir Coffey',
      'Daniel Theis', 'P.J. Tucker'
    ],
  },
  {
    name: 'Los Angeles Lakers',
    players: [
      'LeBron James', 'Anthony Davis', 'D\'Angelo Russell', 'Austin Reaves', 'Rui Hachimura',
      'Jarred Vanderbilt', 'Gabe Vincent', 'Taurean Prince', 'Jaxson Hayes', 'Max Christie',
      'Cam Reddish', 'Christian Wood'
    ],
  },
  {
    name: 'Memphis Grizzlies',
    players: [
      'Ja Morant', 'Jaren Jackson Jr.', 'Desmond Bane', 'Marcus Smart', 'Santi Aldama',
      'Luke Kennard', 'Xavier Tillman', 'Brandon Clarke', 'John Konchar', 'Ziaire Williams',
      'Jake LaRavia', 'David Roddy'
    ],
  },
  {
    name: 'Miami Heat',
    players: [
      'Jimmy Butler', 'Bam Adebayo', 'Tyler Herro', 'Terry Rozier', 'Duncan Robinson',
      'Caleb Martin', 'Jaime Jaquez Jr.', 'Kevin Love', 'Josh Richardson', 'Thomas Bryant',
      'Nikola Jović', 'Haywood Highsmith'
    ],
  },
  {
    name: 'Milwaukee Bucks',
    players: [
      'Giannis Antetokounmpo', 'Damian Lillard', 'Khris Middleton', 'Brook Lopez', 'Bobby Portis',
      'Malik Beasley', 'Jae Crowder', 'Pat Connaughton', 'Cameron Payne', 'MarJon Beauchamp',
      'Thanasis Antetokounmpo', 'A.J. Green'
    ],
  },
  {
    name: 'Minnesota Timberwolves',
    players: [
      'Anthony Edwards', 'Karl-Anthony Towns', 'Rudy Gobert', 'Mike Conley', 'Jaden McDaniels',
      'Naz Reid', 'Kyle Anderson', 'Nickeil Alexander-Walker', 'Troy Brown Jr.', 'Shake Milton',
      'Jordan McLaughlin', 'Luka Garza'
    ],
  },
  {
    name: 'New Orleans Pelicans',
    players: [
      'Zion Williamson', 'Brandon Ingram', 'CJ McCollum', 'Herbert Jones', 'Jonas Valančiūnas',
      'Trey Murphy III', 'Larry Nance Jr.', 'Jose Alvarado', 'Dyson Daniels', 'Naji Marshall',
      'Jordan Hawkins', 'Cody Zeller'
    ],
  },
  {
    name: 'New York Knicks',
    players: [
      'Jalen Brunson', 'Julius Randle', 'Josh Hart', 'Donte DiVincenzo', 'Mitchell Robinson',
      'Isaiah Hartenstein', 'Miles McBride', 'Precious Achiuwa', 'Alec Burks', 'Bojan Bogdanović',
      'Jericho Sims', 'Evan Fournier'
    ],
  },
  {
    name: 'Oklahoma City Thunder',
    players: [
      'Shai Gilgeous-Alexander', 'Jalen Williams', 'Chet Holmgren', 'Josh Giddey', 'Lu Dort',
      'Isaiah Joe', 'Aaron Wiggins', 'Jaylin Williams', 'Kenrich Williams', 'Ousmane Dieng',
      'Gordon Hayward', 'Tre Mann'
    ],
  },
  {
    name: 'Orlando Magic',
    players: [
      'Paolo Banchero', 'Franz Wagner', 'Wendell Carter Jr.', 'Jalen Suggs', 'Markelle Fultz',
      'Cole Anthony', 'Jonathan Isaac', 'Moritz Wagner', 'Gary Harris', 'Joe Ingles',
      'Anthony Black', 'Goga Bitadze'
    ],
  },
  {
    name: 'Philadelphia 76ers',
    players: [
      'Joel Embiid', 'Tyrese Maxey', 'Tobias Harris', 'Kelly Oubre Jr.', 'Nicolas Batum',
      'Buddy Hield', 'Paul Reed', 'Ricky Council IV', 'Mo Bamba', 'Kyle Lowry',
      'KJ Martin', 'Cameron Payne'
    ],
  },
  {
    name: 'Phoenix Suns',
    players: [
      'Kevin Durant', 'Devin Booker', 'Bradley Beal', 'Jusuf Nurkić', 'Grayson Allen',
      'Eric Gordon', 'Josh Okogie', 'Royce O\'Neale', 'Drew Eubanks', 'Bol Bol',
      'David Roddy', 'Damion Lee'
    ],
  },
  {
    name: 'Portland Trail Blazers',
    players: [
      'Anfernee Simons', 'Jerami Grant', 'Deandre Ayton', 'Scoot Henderson', 'Shaedon Sharpe',
      'Matisse Thybulle', 'Malcolm Brogdon', 'Jabari Walker', 'Kris Murray', 'Duop Reath',
      'Toumani Camara', 'Ish Wainright'
    ],
  },
  {
    name: 'Sacramento Kings',
    players: [
      "De'Aaron Fox", 'Domantas Sabonis', 'Keegan Murray', 'Harrison Barnes', 'Malik Monk',
      'Kevin Huerter', 'Davion Mitchell', 'Trey Lyles', 'Sasha Vezenkov', 'Alex Len',
      'Kessler Edwards', 'JaVale McGee'
    ],
  },
  {
    name: 'San Antonio Spurs',
    players: [
      'Victor Wembanyama', 'Devin Vassell', 'Keldon Johnson', 'Jeremy Sochan', 'Tre Jones',
      'Zach Collins', 'Malaki Branham', 'Julian Champagnie', 'Blake Wesley', 'Cedi Osman',
      'Sandro Mamukelashvili', 'Charles Bassey'
    ],
  },
  {
    name: 'Toronto Raptors',
    players: [
      'Scottie Barnes', 'RJ Barrett', 'Immanuel Quickley', 'Jakob Poeltl', 'Gary Trent Jr.',
      'Gradey Dick', 'Kelly Olynyk', 'Bruce Brown', 'Chris Boucher', 'Jontay Porter',
      'Garrett Temple', 'Jordan Nwora'
    ],
  },
  {
    name: 'Utah Jazz',
    players: [
      'Lauri Markkanen', 'Jordan Clarkson', 'Walker Kessler', 'Collin Sexton', 'John Collins',
      'Kris Dunn', 'Ochai Agbaji', 'Taylor Hendricks', 'Keyonte George', 'Talen Horton-Tucker',
      'Kelly Olynyk', 'Luka Šamanić'
    ],
  },
  {
    name: 'Washington Wizards',
    players: [
      'Kyle Kuzma', 'Jordan Poole', 'Tyus Jones', 'Deni Avdija', 'Marvin Bagley III',
      'Corey Kispert', 'Bilal Coulibaly', 'Eugene Omoruyi', 'Richaun Holmes', 'Landry Shamet',
      'Tristan Vukčević', 'Johnny Davis'
    ],
  },
];

export function SelectTeam({ onSelectTeam, onSelectPlayers, excludeTeam }) {
    const [selectedTeam, setSelectedTeam] = useState('');
    const [selectedPlayers, setSelectedPlayers] = useState([]);

    const handleTeamChange = (e) => {
        setSelectedTeam(e.target.value);
        setSelectedPlayers([]);
        if (onSelectTeam) onSelectTeam(e.target.value);
    };

    const handlePlayerToggle = (player) => {
        let updated;
        if (selectedPlayers.includes(player)) {
            updated = selectedPlayers.filter(p => p !== player);
        } else if (selectedPlayers.length < 5) {
            updated = [...selectedPlayers, player];
        } else {
            updated = selectedPlayers;
        }
        setSelectedPlayers(updated);
        if (onSelectPlayers) onSelectPlayers(updated);
    };

    const currentTeam = teamsData.find((team) => team.name === selectedTeam);

    return (
        <div>
            <label htmlFor="team-select">Select NBA Team:</label>
            <select
                id="team-select"
                value={selectedTeam}
                onChange={handleTeamChange}
            >
                <option value="">--Choose a team--</option>
                {teamsData
                  .filter(team => !excludeTeam || team.name !== excludeTeam)
                  .map((team) => (
                    <option key={team.name} value={team.name}>
                        {team.name}
                    </option>
                ))}
            </select>

            {currentTeam && (
                <div style={{ marginTop: 16 }}>
                    <div>Select up to 5 Players:</div>
                    {currentTeam.players.map((player) => (
                        <div key={player}>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={selectedPlayers.includes(player)}
                                    onChange={() => handlePlayerToggle(player)}
                                    disabled={
                                        !selectedPlayers.includes(player) &&
                                        selectedPlayers.length >= 5
                                    }
                                />
                                {player}
                            </label>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default SelectTeam;