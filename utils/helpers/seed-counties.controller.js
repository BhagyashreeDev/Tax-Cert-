import dotenv from 'dotenv';

import connectDB from './db/connection.js';;



dotenv.config();



const neCounties = [

    { county: 'adams', url: 'https://nebraskataxesonline.us/search.aspx?county=Adams' },

    { county: 'antelope', url: 'https://nebraskataxesonline.us/search.aspx?county=Antelope' },

    { county: 'banner', url: 'https://nebraskataxesonline.us/search.aspx?county=Banner' },

    { county: 'boone', url: 'https://nebraskataxesonline.us/search.aspx?county=Boone' },

    { county: 'boxbutte', url: 'https://nebraskataxesonline.us/County/65'},

    { county: 'buffalo', url: 'https://nebraskataxesonline.us/search.aspx?county=Buffalo' },

    { county: 'burt', url: 'https://nebraskataxesonline.us/search.aspx?county=Burt' },

    { county: 'cass', url: 'https://nebraskataxesonline.us/search.aspx?county=Cass' },

    { county: 'cedar', url: 'https://nebraskataxesonline.us/search.aspx?county=Cedar' },

    { county: 'chase', url: 'https://nebraskataxesonline.us/search.aspx?county=Chase' },

    { county: 'cherry', url: 'https://nebraskataxesonline.us/search.aspx?county=Cherry' },

    { county: 'cheyenne', url: 'https://nebraskataxesonline.us/search.aspx?county=Cheyenne' },

    { county: 'clay', url: 'https://nebraskataxesonline.us/search.aspx?county=Clay' },

    { county: 'colfax', url: 'https://nebraskataxesonline.us/search.aspx?county=Colfax' },

    { county: 'cuming', url: 'https://nebraskataxesonline.us/search.aspx?county=Cuming' },

    { county: 'dakota', url: 'https://nebraskataxesonline.us/search.aspx?county=Dakota' },

    { county: 'dawes', url: 'https://nebraskataxesonline.us/search.aspx?county=Dawes' },

    { county: 'dawson', url: 'https://nebraskataxesonline.us/search.aspx?county=Dawson' },

    { county: 'deuel', url: 'https://nebraskataxesonline.us/search.aspx?county=Deuel' },

    { county: 'dixon', url: 'https://nebraskataxesonline.us/search.aspx?county=Dixon' },

    { county: 'dundy', url: 'https://nebraskataxesonline.us/search.aspx?county=Dundy' },

    { county: 'fillmore', url: 'https://nebraskataxesonline.us/search.aspx?county=Fillmore' },

    { county: 'franklin', url: 'https://nebraskataxesonline.us/search.aspx?county=Franklin' },

    { county: 'frontier', url: 'https://nebraskataxesonline.us/search.aspx?county=Frontier' },

    { county: 'furnas', url: 'https://nebraskataxesonline.us/search.aspx?county=Furnas' },

    { county: 'gage', url: 'https://nebraskataxesonline.us/search.aspx?county=Gage' },

    { county: 'garden', url: 'https://nebraskataxesonline.us/search.aspx?county=Garden' },

    { county: 'garfield', url: 'https://nebraskataxesonline.us/search.aspx?county=Garfield' },

    { county: 'gosper', url: 'https://nebraskataxesonline.us/search.aspx?county=Gosper' },

    { county: 'grant', url: 'https://nebraskataxesonline.us/search.aspx?county=Grant' },

    { county: 'greeley', url: 'https://nebraskataxesonline.us/search.aspx?county=Greeley' },

    { county: 'hall', url: 'https://nebraskataxesonline.us/search.aspx?county=Hall' },

    { county: 'hamilton', url: 'https://nebraskataxesonline.us/search.aspx?county=Hamilton' },

    { county: 'harlan', url: 'https://nebraskataxesonline.us/search.aspx?county=Harlan' },

    { county: 'hayes', url: 'https://nebraskataxesonline.us/search.aspx?county=Hayes' },

    { county: 'hitchcock', url: 'https://nebraskataxesonline.us/search.aspx?county=Hitchcock' },

    { county: 'holt', url: 'https://nebraskataxesonline.us/search.aspx?county=Holt' },

    { county: 'jefferson', url: 'https://nebraskataxesonline.us/search.aspx?county=Jefferson' },

    { county: 'johnson', url: 'https://nebraskataxesonline.us/search.aspx?county=Johnson' },

    { county: 'kearney', url: 'https://nebraskataxesonline.us/search.aspx?county=Kearney' },

    { county: 'keith', url: 'https://nebraskataxesonline.us/search.aspx?county=Keith' },

    { county: 'kimball', url: 'https://nebraskataxesonline.us/search.aspx?county=Kimball' },

    { county: 'knox', url: 'https://nebraskataxesonline.us/search.aspx?county=Knox' },

    { county: 'lincoln', url: 'https://nebraskataxesonline.us/search.aspx?county=Lincoln' },

    { county: 'logan', url: 'https://nebraskataxesonline.us/search.aspx?county=Logan' },

    { county: 'madison', url: 'https://nebraskataxesonline.us/search.aspx?county=Madison' },

    { county: 'mcpherson', url: 'https://nebraskataxesonline.us/search.aspx?county=McPherson' },

    { county: 'merrick', url: 'https://nebraskataxesonline.us/search.aspx?county=Merrick' },

    { county: 'morrill', url: 'https://nebraskataxesonline.us/search.aspx?county=Morrill' },

    { county: 'nance', url: 'https://nebraskataxesonline.us/search.aspx?county=Nance' },

    { county: 'nemaha', url: 'https://nebraskataxesonline.us/search.aspx?county=Nemaha' },

    { county: 'nuckolls', url: 'https://nebraskataxesonline.us/search.aspx?county=Nuckolls' },

    { county: 'otoe', url: 'https://nebraskataxesonline.us/search.aspx?county=Otoe' },

    { county: 'pawnee', url: 'https://nebraskataxesonline.us/search.aspx?county=Pawnee' },

    { county: 'perkins', url: 'https://nebraskataxesonline.us/search.aspx?county=Perkins' },

    { county: 'phelps', url: 'https://nebraskataxesonline.us/search.aspx?county=Phelps' },

    { county: 'pierce', url: 'https://nebraskataxesonline.us/search.aspx?county=Pierce' },

    { county: 'platte', url: 'https://nebraskataxesonline.us/search.aspx?county=Platte' },

    { county: 'redwillow', url: 'https://nebraskataxesonline.us/search.aspx?county=Red%20Willow' },

    { county: 'richardson', url: 'https://nebraskataxesonline.us/search.aspx?county=Richardson' },

    { county: 'rock', url: 'https://nebraskataxesonline.us/search.aspx?county=Rock' },

    { county: 'saline', url: 'https://nebraskataxesonline.us/search.aspx?county=Saline' },

    { county: 'saunders', url: 'https://nebraskataxesonline.us/search.aspx?county=Saunders' },

    { county: 'scottsbluff', url: 'https://nebraskataxesonline.us/County/21' },

    { county: 'seward', url: 'https://nebraskataxesonline.us/search.aspx?county=Seward' },

    { county: 'sheridan', url: 'https://nebraskataxesonline.us/search.aspx?county=Sheridan' },

    { county: 'sioux', url: 'https://nebraskataxesonline.us/search.aspx?county=Sioux' },

    { county: 'stanton', url: 'https://nebraskataxesonline.us/search.aspx?county=Stanton' },

    { county: 'thayer', url: 'https://nebraskataxesonline.us/search.aspx?county=Thayer' },

    { county: 'thomas', url: 'https://nebraskataxesonline.us/search.aspx?county=Thomas' },

    { county: 'thurston', url: 'https://nebraskataxesonline.us/search.aspx?county=Thurston' },

    { county: 'valley', url: 'https://nebraskataxesonline.us/search.aspx?county=Valley' },

    { county: 'washington', url: 'https://nebraskataxesonline.us/search.aspx?county=Washington' },

    { county: 'wayne', url: 'https://nebraskataxesonline.us/search.aspx?county=Wayne' },

    { county: 'webster', url: 'https://nebraskataxesonline.us/search.aspx?county=Webster' },

    { county: 'wheeler', url: 'https://nebraskataxesonline.us/search.aspx?county=Wheeler' },

    { county: 'york', url: 'https://nebraskataxesonline.us/search.aspx?county=York' }

];



const titleCase = (text) => text

    .split(/[-_ ]+/)

    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())

    .join(' ');



const main = async () => {

    const connection = await connectDB();



    try {

        const paths = neCounties.map(item => `/tax/NE/${item.county}`);

        const countyNames = neCounties.map(item => titleCase(item.county));



        const [existingRows] = await connection.query(

            `SELECT county_name, path

             FROM county_test

             WHERE state_code = ?

             AND (county_name IN (?) OR path IN (?))`,

            ['NE', countyNames, paths]

        );



        const existingSet = new Set(

            existingRows.flatMap(row => [row.county_name, row.path])

        );



        const rowsToInsert = neCounties

            .map(item => [

                'Nebraska',

                'NE',

                titleCase(item.county),

                item.url,

                `/tax/NE/${item.county}`,

                1

            ])

            .filter(row =>

                !existingSet.has(row[2]) &&

                !existingSet.has(row[4])

            );



        if (rowsToInsert.length === 0) {

            console.log('No new NE counties to insert.');

            return;

        }



        const placeholders = rowsToInsert

            .map(() => '(?, ?, ?, ?, ?, ?)')

            .join(', ');



        await connection.query(

            `INSERT INTO county_test

            (state_name, state_code, county_name, property_tax_link, path, status)

            VALUES ${placeholders}`,

            rowsToInsert.flat()

        );



        rowsToInsert.forEach(row =>

            console.log(`Inserted county: ${row[2]}`)

        );



        console.log(

            `Inserted ${rowsToInsert.length} Nebraska counties successfully`

        );

    } catch (error) {

        console.error('Seeding failed:', error);

    } finally {

        await connection.end();

    }

};



main();
